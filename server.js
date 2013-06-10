var express = require('express'),
    monk = require('monk'),
    OAuth = require('oauth').OAuth,
    nconf = require('nconf'),
    querystring = require('querystring');
var googleSpreadsheetFeedUrl = "https://spreadsheets.google.com/feeds",
    app, db, outputs, oAuthCredentials;
var getRequestTokenUrl = "https://www.google.com/accounts/OAuthGetRequestToken";
var gdataScopes = [
  querystring.escape(googleSpreadsheetFeedUrl)
];
   
nconf.argv()
     .env()
     .file({ file: './config.json' });

outputs = nconf.get('outputs');

db = require('monk')(nconf.get('database'));
oAuthTokens = db.get('oauthtokens');

app = express();
app.use(express.bodyParser());
app.use(express.cookieParser());
app.use(express.session({
  secret: "skjghskdjfhbqigohqdiouk"
}));
// Use handlebars for views
app.set('view engine', 'html');
app.engine('html', require('hbs').__express);


function saveOAuthToken(id, token, tokenSecret) {
  oAuthTokens.insert({
    id: id, 
    token: token,
    tokenSecret: tokenSecret
  });
}

function getOAuthToken(id, cb) {
  oAuthTokens.findOne({ id: id }).on('success', cb);
}

function getOAuthObject(req, id) {
  var host = req.headers.host;
	return new OAuth(getRequestTokenUrl+"?scope="+gdataScopes.join('+'),
                     "https://www.google.com/accounts/OAuthGetAccessToken",
                     "anonymous",
                     "anonymous",
                     "1.0",
                     "http://"+host+"/"+id+"/google_cb"+( req.param('action') && req.param('action') !== "" ? "?action="+querystring.escape(req.param('action')) : "" ),
                     "HMAC-SHA1");
}

app.get('/:id/google_login', function(req, res) {
  var id = req.params.id;
  var oa = getOAuthObject(req, id);

	oa.getOAuthRequestToken(function(error, oauth_token, oauth_token_secret, results){
    if(error) {
      console.log('error');
      console.log(error);
    }
    else { 
      // store the tokens in the session
      req.session.oa = oa;
      req.session.oauth_token = oauth_token;
      req.session.oauth_token_secret = oauth_token_secret;

      // redirect the user to authorize the token
      res.redirect("https://www.google.com/accounts/OAuthAuthorizeToken?oauth_token="+oauth_token);
    }
  });
});


app.get('/:id/google_cb', function(req, res) {
	// get the OAuth access token with the 'oauth_verifier' that we received
  var id = req.params.id;

	var oa = new OAuth(req.session.oa._requestUrl,
                     req.session.oa._accessUrl,
                     req.session.oa._consumerKey,
                     req.session.oa._consumerSecret,
                     req.session.oa._version,
                     req.session.oa._authorize_callback,
                     req.session.oa._signatureMethod);

	oa.getOAuthAccessToken(
		req.session.oauth_token, 
		req.session.oauth_token_secret, 
		req.param('oauth_verifier'), 
		function(error, oauth_access_token, oauth_access_token_secret, results2) {

			if(error) {
				console.log('error');
				console.log(error);
      }
      else {
        // BOOKMARK
				// store the access token in the session
        saveOAuthToken(id, oauth_access_token, oauth_access_token_secret);

        res.redirect((req.param('action') && req.param('action') !== "") ? req.param('action') : "/oauth-success");
      }
	});
});

app.get('/oauth-success', function(req, res) {
  res.render('oauth_success');
});

var getFeedUrl = function(params) {
  var visibility = "private";
  var projection = "full";
  params.push(visibility, projection);
  return googleSpreadsheetFeedUrl+"/"+params.join("/"); 
};

var getFeed = function(params, oa, token, cb) {
  var url = getFeedUrl(params);

  url = url + "?alt=json";
	oa.get(
    url, 
    token.token,
    token.tokenSecret,
    function (error, data, response) {
      console.log(data);
      var feed = JSON.parse(data);
      cb(feed.feed);
  });
};

var postFeed = function(params, body, oa, token, cb) {
  var url = getFeedUrl(params);
  oa.post(
    url,
    token.token,
    token.tokenSecret,
    body,
   'application/atom+xml',
    function (error, data, response) {
      console.log(error);
      console.log(data);
      cb(data);
  });
};

var getEntryXml = function(data) {
  var entryXml = '\
    <entry xmlns="http://www.w3.org/2005/Atom"\
    xmlns:gsx="http://schemas.google.com/spreadsheets/2006/extended">\
  ';
  Object.keys(data).forEach(function(key) {
    var val = data[key];
    entryXml += '<gsx:'+ key + '>' + val + '</gsx:' + key + '>';
  });
  entryXml += "</entry>";
  return entryXml;
};

var addRow = function(key, worksheet, data, oa, token, cb) {
  var params = ['list', key, worksheet];
  var body = getEntryXml(data);
  postFeed(params, body, oa, token, cb);
};

// Handler for the SMS Request URL configured for a Twilio phone number
// POST parameters are documented at
// http://www.twilio.com/docs/api/twiml/sms/twilio_request
app.post('/:id/twilio-sms-request', function(req, res) {
  var id = req.params.id,
      key = outputs[id].options.key,
      worksheet = outputs[id].options.worksheet;
  // TODO: Get this programatically
  var worksheetId = 'od6';

  getOAuthToken(id, function(token) {
    var oa = getOAuthObject(req, id);
    // TODO: Get data from Twilio 
    var data = {
      smssid: req.body.SmsSid,
      from: req.body.From, 
      body: req.body.Body 
    };
    addRow(key, worksheetId, data, oa, token, function(feed) {
      // TODO: Do something here 
    });
  });

  // If we wanted to send an SMS response, we could, but for now,
  // just send back an empty response
  res.send('');
});

app.listen(3000);
console.log("listening on http://localhost:3000");
