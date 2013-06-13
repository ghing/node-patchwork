var express = require('express'),
    nconf = require('nconf'),
    inputs = require('./inputs'),
    outputs = require('./outputs');

var app;

function initRoutes(conf, app) {
  var inConf = conf.get('inputs');
  var outConf = conf.get('outputs');
  var routes = conf.get('routes');

  Object.keys(inConf).forEach(function(id) {
    var input = inputs.create(id, inConf[id].driver, inConf[id].options);
    input.contributeRoutes(app);
  });

  Object.keys(outConf).forEach(function(id) {
    var output = outputs.create(id, outConf[id].driver, outConf[id].options);
    output.contributeRoutes(app);
  });

  Object.keys(routes).forEach(function(id) {
    var routeInputIds = routes[id].inputs; 
    var routeOutputIds = routes[id].outputs;
    routeOutputIds.forEach(function(outputId) {
      var output = outputs.get(outputId);
      routeInputIds.forEach(function(inputId) {
        var input = inputs.get(inputId);
        output.addInput(input);
      });
    });
  });
}
   
nconf.argv()
     .env()
     .file({ file: './config.json' });
outputs.configure(nconf);

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

initRoutes(nconf, app);
app.listen(3000);
console.log("listening on http://localhost:3000");
