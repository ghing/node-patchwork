var express = require('express'),
    nconf = require('nconf'),
    nodes = require('./nodes');

var app;

   
nconf.argv()
     .env()
     .file({ file: './config.json' });
nodes.configure(nconf);

app = express();
app.use(express.bodyParser());
app.use(express.cookieParser());
app.use(express.session({
  secret: "skjghskdjfhbqigohqdiouk"
}));
// Use handlebars for views
app.set('view engine', 'html');
app.engine('html', require('hbs').__express);

app.get('/oauth-success', function(req, res) {
  res.render('oauth_success');
});

nodes.initialize(nconf, app);
app.listen(3000);
console.log("listening on http://localhost:3000");
