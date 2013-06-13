var monk = require('monk'),
    OAuth = require('oauth').OAuth,
    querystring = require('querystring'),
    util = require('util');

var db;
var hostname;
var oAuthTokens;
var getRequestTokenUrl = "https://www.google.com/accounts/OAuthGetRequestToken";
var drivers = {};
var registry = {};

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

function Output(id, opts) {
  this.id = id;
  this.options = opts;
}

Output.prototype.addInput = function(input) {
  input.on('message', this.handleMessage.bind(this));  
};

var getFeedUrl = function(baseUrl, params) {
  var visibility = "private";
  var projection = "full";
  params.push(visibility, projection);
  return baseUrl+"/"+params.join("/"); 
};

var getFeed = function(baseUrl, params, oa, token, cb) {
  var url = getFeedUrl(baseUrl, params);

  url = url + "?alt=json";
	oa.get(
    url, 
    token.token,
    token.tokenSecret,
    function (error, data, response) {
      var feed = JSON.parse(data);
      cb(feed.feed);
  });
};

var postFeed = function(baseUrl, params, body, oa, token, cb) {
  var url = getFeedUrl(baseUrl, params);
  console.dir(url);
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

function GoogleSpreadsheetOutput(id, opts) {
  GoogleSpreadsheetOutput.super_.call(this, id, opts);
}
util.inherits(GoogleSpreadsheetOutput, Output);

GoogleSpreadsheetOutput.driverName = "Google Spreadsheet";
GoogleSpreadsheetOutput.driverId = "google-spreadsheet";
GoogleSpreadsheetOutput.feedUrl = "https://spreadsheets.google.com/feeds";
GoogleSpreadsheetOutput.gdataScopes = [
  querystring.escape(GoogleSpreadsheetOutput.feedUrl)
];

GoogleSpreadsheetOutput.prototype.contributeRoutes = function(app) {
  var output = this;

  app.get('/' + this.id + '/google_login', function(req, res) {
    var oa = new OAuth(getRequestTokenUrl+"?scope="+GoogleSpreadsheetOutput.gdataScopes.join('+'),
                     "https://www.google.com/accounts/OAuthGetAccessToken",
                     "anonymous",
                     "anonymous",
                     "1.0",
                     "http://"+req.headers.host+"/"+output.id+"/google_cb"+( req.param('action') && req.param('action') !== "" ? "?action="+querystring.escape(req.param('action')) : "" ),
                     "HMAC-SHA1");

    oa.getOAuthRequestToken(function(error, oauth_token, oauth_token_secret, results){
      if (error) {
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

  app.get('/' + this.id + '/google_cb', function(req, res) {
    // get the OAuth access token with the 'oauth_verifier' that we received
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
          // store the access token in the session
          saveOAuthToken(output.id, oauth_access_token, oauth_access_token_secret);

          res.redirect((req.param('action') && req.param('action') !== "") ? req.param('action') : "/oauth-success");
        }
    });
  });
};

GoogleSpreadsheetOutput.prototype.getEntryXml =  function(data) {
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

GoogleSpreadsheetOutput.prototype.addRow =  function(key, worksheet, data, oa, token, cb) {
  var params = ['list', key, worksheet];
  var body = this.getEntryXml(data);
  postFeed(GoogleSpreadsheetOutput.feedUrl, params, body, oa, token, cb);
};

GoogleSpreadsheetOutput.prototype.handleMessage = function(msg) {
  var output = this; 
  var key = this.options.key;

  getOAuthToken(this.id, function(token) {
    var oa = new OAuth(getRequestTokenUrl+"?scope="+GoogleSpreadsheetOutput.gdataScopes.join('+'),
                     "https://www.google.com/accounts/OAuthGetAccessToken",
                     "anonymous",
                     "anonymous",
                     "1.0",
                     null,
                     "HMAC-SHA1");

    output.addRow(key, output.options.worksheetId, msg, oa, token, function(feed) {
      // TODO: Do something here 
    });
  });
};

drivers[GoogleSpreadsheetOutput.driverId] = GoogleSpreadsheetOutput;

function createOutput(id, driverId, opts) {
  var inputClass = drivers[driverId];
  return new inputClass(id, opts);
}

function configure(conf) {
  db = monk(conf.get('database'));
  hostname = conf.get('hostname');
  oAuthTokens = db.get('oauthtokens');
}

function create(id, driverId, opts) {
  var outputClass = drivers[driverId];
  var output = new outputClass(id, opts);
  registry[id] = output; 
  return output;
}

function get(id) {
  return registry[id];
}

module.exports = {
  configure: configure,
  create: create,
  get: get
};
