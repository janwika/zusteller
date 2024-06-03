console.log("hi from line 1");

let replyAlreadySet = false

const buttonHtml = (tooltip) => (`
<div id=":21" class="T-I J-J5-Ji nf T-I-ax7 L3" role="button" tabindex="0" aria-label="Weitere E‑Mail-Optionen"
    aria-haspopup="false" aria-expanded="false" data-tooltip="${tooltip}" style="user-select: none;">
    <div class="asa">
        <img width="20px", src="https://storage.googleapis.com/office-bot-bucket/zusteller_logo.png">
    </div>
    <div class="G-asx T-I-J3 J-J5-Ji">&nbsp;</div>
</div>
`)

function placeReplyIcon() {
  const toolbar = document.getElementsByClassName('btC')[0]
  if(toolbar) {
    if(replyAlreadySet) return
    console.log('found reply tools')
    const zustellerTool = document.createElement("div")
    zustellerTool.setAttribute("class", "G-Ni J-J5-Ji")
    zustellerTool.innerHTML = buttonHtml('✨Write Email For Me✨')
    zustellerTool.setAttribute("style", "flex; padding-left: 10px;")
    console.log(zustellerTool)
    toolbar.addEventListener("click", onReplyToolClick)
    toolbar.insertBefore(zustellerTool, toolbar.childNodes[1])
    replyAlreadySet = true
  } else {
    replyAlreadySet = false
  }
}

function onReplyToolClick() {
  const textField = document.querySelectorAll("[class*='editable']")[0];
  console.log(textField)
  textField.textContent = '✨🤔✨'

  const incomingEmail = document.querySelectorAll("[id*='gmail-docs-internal']")[0];
  console.log(incomingEmail)

  const spans = incomingEmail.querySelectorAll('p > span')

  const email = Array.from(spans)
      .map(span => span.textContent)
      .join(' ');
  
  chrome.runtime.sendMessage({ action: 'write email pls', email }, (response) => {
    console.log(response)
    const textField = document.querySelectorAll("[class*='editable']")[0];
    console.log(textField)
    textField.textContent = response.responseEmail
  });
}

function onTableClick() {
  const selectedEmails = document.querySelectorAll("[class*='x7']");
  const emailsBody = document.querySelector("#\\:22 > tbody")
  //document.getElementById("domainChecker").innerHTML = selectedEmails[0];
  console.log(selectedEmails)
  let subjects = []
  for (element of selectedEmails) {
    let el = element.getElementsByClassName("bog");
    if(el.length != 0) {
        subjects.push(el[0].textContent)
    }
  }

  chrome.runtime.sendMessage({ action: 'requestData', subjects }, (response) => {});
}

function init() {
  let toolbar = document.getElementsByClassName('G-tF')[0];
  if(toolbar) {
    console.log("appending to toolbar")
    const zustellerTool = document.createElement("div")
    zustellerTool.setAttribute("class", "G-Ni J-J5-Ji")
    zustellerTool.innerHTML = buttonHtml('Create Template')
    zustellerTool.setAttribute("style", "flex")
    console.log(zustellerTool)
    toolbar.addEventListener("click", onTableClick)
    toolbar.appendChild(zustellerTool)
  }

  document.addEventListener("click", placeReplyIcon)
}

const maxRetries = 10;
for (let retries = 0; retries < maxRetries; retries++) {
  try {
    setTimeout(init, 1000, false)
  } catch {
    continue
  }
  break
}