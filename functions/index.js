const Auth = require('@google-cloud/express-oauth2-handlers');
const {google} = require('googleapis');
const admin = require('firebase-admin');
const { Datastore } = require('@google-cloud/datastore');
const { v4: uuidv4 } = require('uuid');
const { SessionsClient } = require('@google-cloud/dialogflow-cx');
const { GoogleAuth } = require('google-auth-library');

admin.initializeApp();
const requiredScopes = [
  'profile',
  'email',
  'https://mail.google.com/',
  'https://www.googleapis.com/auth/drive'
];

const auth = Auth('datastore', requiredScopes, 'email', true);
const GCP_PROJECT = process.env.GCP_PROJECT;

const onSuccess = async (req, res) => {
  res.send(`Successfully allowed Zusteller to access GMail :)`);
};

const onFailure = (err, req, res) => {
  console.error(err);
  res.send(err);
};

const validateFirebaseIdToken = async (req, res) => {
  console.log('Check if request is authorized with Firebase ID token');

  if ((!req.headers.authorization || !req.headers.authorization.startsWith('Bearer '))) {
    return null;
  }

  let idToken;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    console.log('Found "Authorization" header');
    // Read the ID Token from the Authorization header.
    idToken = req.headers.authorization.split('Bearer ')[1];
  } else {
    // No cookie
    return null;
  }

  try {
    const decodedIdToken = await admin.auth().verifyIdToken(idToken);
    console.log('ID Token correctly decoded', decodedIdToken);
    return decodedIdToken;
  } catch (error) {
    console.error('Error while verifying Firebase ID token:', error);
    return null;
  }
};

async function callGmailApi(emailAddress, subjects) {
  const oauth2Client = await auth.auth.authedUser.getClient(null, null, emailAddress);

  const tokenInfo = await oauth2Client.getTokenInfo(
    oauth2Client.credentials.access_token
  );
  console.log('Token Info:', tokenInfo);

  const gmail = google.gmail('v1');

  try {
    const replies = [];

    for (const subject of subjects) {
      console.log(`Searching for emails with subject: ${subject}`);
      const query = `from:me OR to:me subject:"${subject}"`; // Adjust query for specific needs

      const response = await gmail.users.messages.list({
        auth: oauth2Client,
        userId: 'me',
        q: query,
      });

      const messageList = response.data.messages || [];
      console.log(`Found ${messageList.length} messages for subject: ${subject}`);

      if (messageList.length === 0) {
        continue; // No email found with the subject, continue to the next subject
      }

      for (const message of messageList) {
        console.log(`Processing message ID: ${message.id}, thread ID: ${message.threadId}`);
        const threadResponse = await gmail.users.threads.get({
          auth: oauth2Client,
          userId: 'me',
          id: message.threadId,
        });

        const threadMessages = threadResponse.data.messages || [];
        console.log(`Thread contains ${threadMessages.length} messages`);

        if (threadMessages.length <= 1) {
          console.log('No replies found in this thread');
          continue; // No replies in this thread, continue to the next message
        }

        // Assuming the first reply is the second message in the thread
        const firstReply = threadMessages[1];
        console.log(`First reply message ID: ${firstReply.id}`);

        const messageParts = firstReply.payload.parts || [];
        console.log(`Message parts count: ${messageParts.length}`);
        
        // Assuming the first text/plain part contains the body (adjust logic if needed)
        const textPlainPart = messageParts.find(part => part.mimeType === 'text/plain');
        if (!textPlainPart) {
          console.log('No text/plain part found in the reply');
          continue;
        }

        const body = textPlainPart.body.data || '';
        console.log(`Encoded body length: ${body.length}`);

        // Decode base64 encoded body data
        const decodedBody = Buffer.from(body, 'base64').toString();
        replies.push(decodedBody);
        console.log(`Decoded body: ${decodedBody.substring(0, 100)}...`); // Log the first 100 chars for brevity
      }
    }

    return replies;
  } catch (error) {
    console.error('Error calling Gmail API:', error);
  }
}


async function callDialogflowCxAgent(queryText, sessionId, agentId) {
  const serviceAccountPath = './service-account-file.json';
  const auth = new GoogleAuth({
    keyFile: serviceAccountPath,
    scopes: 'https://www.googleapis.com/auth/cloud-platform',
  });

  const client = new SessionsClient({ auth });

  const sessionPath = client.projectLocationAgentSessionPath(
    GCP_PROJECT,
    'global',
    agentId,
    sessionId
  );

  const queryInput = {
    text: {
      text: queryText
    },
    languageCode: 'en'
  };

  const request = {
    session: sessionPath,
    queryInput: queryInput,
  };

  const [response] = await client.detectIntent(request);
  return {
    responseId: response.responseId,
    queryResult: {
      text: response.queryResult.text,
      triggerIntent: response.queryResult.triggerIntent,
      transcript: response.queryResult.transcript,
      triggerEvent: response.queryResult.triggerEvent,
      languageCode: response.queryResult.languageCode,
      parameters: response.queryResult.parameters,
      responseMessages: response.queryResult.responseMessages.map((message) => ({
        text: message.text.text[0],
      })),
    },
  };
}

async function getAgentResponseTemplateCreation(replies) {
  let queryText = 'hi, these are some answer emails, please create a template for me'
  try {
    replies.forEach(reply => {
      queryText = `\n${queryText}\n BEGIN EMAIL\n ${reply} \nEND EMAIL`
    })
    console.log(`agent queryText: ${queryText}`)
    const sessionId = uuidv4();
    return await callDialogflowCxAgent(queryText, sessionId, 'bc685701-127a-4c66-818c-8ffa72f11854');
  } catch (error) {
    console.error(error)
    return null
  }
}

async function getAgentResponseEmailCreation(templates, incomingEmail) {
  let queryText = `hi, please write a reply to this email USING ONE AND ONLY ONE OF THE TEMPLATES below \n BEGIN EMAIL\n ${incomingEmail}\n END EMAIL`
  try {
    templates.forEach((template, index) => {
      queryText = `\n${queryText}\n BEGIN TEMPLATE ${index + 1}\n ${template} \n END TEMPLATE ${index + 1}`
    })
    console.log(`agent queryText: ${queryText}`)
    const sessionId = uuidv4();
    return await callDialogflowCxAgent(queryText, sessionId, 'a50b6869-6cda-4364-bcfc-285ca13eb455');
  } catch (error) {
    console.error(error)
    return null
  }
}

async function createGoogleDoc(content, emailAddress) {
  const oauth2Client = await auth.auth.authedUser.getClient(null, null, emailAddress)

  const docs = google.docs({ version: 'v1', auth: oauth2Client });
  const drive = google.drive({ version: 'v3', auth: oauth2Client });

  try {
    // Create a new Google Doc
    const createResponse = await drive.files.create({
      resource: {
        name: 'New Document',
        mimeType: 'application/vnd.google-apps.document',
      },
      fields: 'id',
    });

    const documentId = createResponse.data.id;
    console.log('Created Document ID:', documentId);

    // Write content to the new Google Doc
    await docs.documents.batchUpdate({
      documentId: documentId,
      requestBody: {
        requests: [
          {
            insertText: {
              location: {
                index: 1,
              },
              text: content,
            },
          },
        ],
      },
    });

    console.log('Content written to document');
  } catch (error) {
    console.error('Error creating or writing to document:', error);
  }
}

async function readGoogleDocs(emailAddress) {
  const oauth2Client = await auth.auth.authedUser.getClient(null, null, emailAddress);

  const drive = google.drive({ version: 'v3', auth: oauth2Client });
  const docs = google.docs({ version: 'v1', auth: oauth2Client });

  try {
    // List all files in the root directory
    const listResponse = await drive.files.list({
      q: "mimeType='application/vnd.google-apps.document' and 'root' in parents",
      fields: 'files(id, name)',
    });

    const files = listResponse.data.files;
    const contentArray = [];

    for (const file of files) {
      const documentId = file.id;

      // Read the content of the Google Doc
      const docResponse = await docs.documents.get({
        documentId: documentId,
      });

      const documentContent = docResponse.data.body.content.map(element => {
        if (element.paragraph && element.paragraph.elements) {
          return element.paragraph.elements.map(e => e.textRun ? e.textRun.content : '').join('');
        }
        return '';
      }).join('\n');

      contentArray.push(documentContent);
    }

    return contentArray;
  } catch (error) {
    console.error('Error reading documents:', error);
    return [];
  }
}

exports.createTemplate = async (req, res) => {
  // Set CORS headers to allow all origins
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET,HEAD,OPTIONS,POST,PUT");
  res.setHeader("Access-Control-Allow-Headers", "Access-Control-Allow-Headers, Origin, Accept, X-Requested-With, Content-Type, Access-Control-Request-Method, Access-Control-Request-Headers, Authorization")
  
  if(req.method === 'OPTIONS') {
    return res.status(200).send({data: "this is fine"})
  }
  
  const usr = await validateFirebaseIdToken(req, res)

  console.log(req.body)

  const { subjects } = req.body.data.message

  console.log(`user object: ${usr}`)
  if(usr) {
    const bodies = await callGmailApi(usr.email, subjects)
    console.log(bodies)
    const agentResponse = await getAgentResponseTemplateCreation(bodies)
    const responseMessage = agentResponse.queryResult.responseMessages[agentResponse.queryResult.responseMessages.length - 1].text
    console.log(responseMessage)
    await createGoogleDoc(responseMessage, usr.email)
    res.status(200).send({ data: "works :)" })
  } else {
    res.status(403).send({ data: "Unauthorized" })
  }
};

exports.createResponse = async (req, res) => {
    // Set CORS headers to allow all origins
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET,HEAD,OPTIONS,POST,PUT");
    res.setHeader("Access-Control-Allow-Headers", "Access-Control-Allow-Headers, Origin, Accept, X-Requested-With, Content-Type, Access-Control-Request-Method, Access-Control-Request-Headers, Authorization")
    
    if(req.method === 'OPTIONS') {
      return res.status(200).send({data: "this is fine"})
    }
    
    const usr = await validateFirebaseIdToken(req, res)

    console.log(req.body)
  
    const { incomingEmail } = req.body.data

    console.log(`user object: ${usr}`)
    if(usr) {
      const templates = await readGoogleDocs(usr.email)
      console.log(templates)
      const agentResponse = await getAgentResponseEmailCreation(templates, incomingEmail)
      const responseMessage = agentResponse.queryResult.responseMessages[agentResponse.queryResult.responseMessages.length - 1].text
      console.log(responseMessage)
      res.status(200).send({ data: responseMessage })
    } else {
      res.status(403).send({ data: "Unauthorized" })
    }
}

// Export the Cloud Functions for authorization.
exports.auth_init = auth.routes.init;
exports.auth_callback = auth.routes.cb(onSuccess, onFailure);
