// Initialize Firebase
var config = {
    apiKey: "API_KEY",
    databaseURL: "https://the-office-bots-default-rtdb.europe-west1.firebasedatabase.app",
    storageBucket: "the-office-bots.appspot.com"
  };
  firebase.initializeApp(config);
  
  function initApp() {
    // Listen for auth state changes.
    firebase.auth().onAuthStateChanged(function(user) {
      if (user) {
        // User is signed in.
        var email = user.email;
        document.getElementById('quickstart-button').textContent = `Sign Out`;
      } else {
        // Let's try to get a Google auth token programmatically.
        document.getElementById('quickstart-button').textContent = `Sign-in with Google`;
      }
    });
  
    document.getElementById('quickstart-button').addEventListener('click', startSignIn, false);
  }

  function startAuth(interactive) {
    // Request an OAuth token from the Chrome Identity API.
    chrome.identity.getAuthToken({interactive: !!interactive}, function(token) {
      if (chrome.runtime.lastError && !interactive) {
        console.log('It was not possible to get a token programmatically.');
      } else if(chrome.runtime.lastError) {
        console.error(chrome.runtime.lastError);
      } else if (token) {
        // Authorize Firebase with the OAuth Access Token.
        var credential = firebase.auth.GoogleAuthProvider.credential(null, token);
        firebase.auth().signInWithCredential(credential).catch(function(error) {
          // The OAuth token might have been invalidated. Lets' remove it from cache.
          if (error.code === 'auth/invalid-credential') {
            chrome.identity.removeCachedAuthToken({token: token}, function() {
              startAuth(interactive);
            });
          }
        });
      } else {
        console.error('The OAuth Token was null');
      }
    });
  }

  function startSignIn() {
    if (firebase.auth().currentUser) {
      firebase.auth().signOut();
    } else {
      startAuth(true);
    }
  }
  
  window.onload = function() {
    initApp();
  };