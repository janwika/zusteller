// Initialize Firebase
var config = {
    apiKey: "API_KEY",
    databaseURL: "https://the-office-bots-default-rtdb.europe-west1.firebasedatabase.app",
    storageBucket: "the-office-bots.appspot.com",
    projectId: "the-office-bots"
  };
  firebase.initializeApp(config);

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log(message)
    if (message.action === 'requestData') {
      const functions = firebase.functions();
      const callCloudFunction = functions.httpsCallable('createTemplate');
      callCloudFunction({ message }, { mode: 'no-cors' })
      .then((response) => {
        console.log(response.data); // Handle successful response data
        sendResponse({data: 'all good :)'})
      })
      .catch((error) => {
        console.error(error); // Handle errors during function call
        sendResponse({data: 'not so good :('})
      });
      return true
    } else if (message.action === 'write email pls') {
      try {
        const functions = firebase.functions();
        const callCloudFunction = functions.httpsCallable('createResponse');
        callCloudFunction({ incomingEmail: message.email }, { mode: 'no-cors' })
        .then((response) => {
          console.log(response.data); // Handle successful response data
          sendResponse({responseEmail: response.data})
        })
        .catch((error) => {
          console.error(error); // Handle errors during function call
          sendResponse({responseEmail: 'Something went wrong, sorry 🫠'})
        });
      } catch(err) {
        sendResponse({responseEmail: 'Something went wrong, sorry 🫠'})
      }
      return true
    }
  });

  function initApp() {
    // Listen for auth state changes.
    firebase.auth().onAuthStateChanged(function(user) {
      console.log('User state change detected from the Background script of the Chrome Extension:', user);
    });
  }
  
  window.onload = function() {
    initApp();
  };