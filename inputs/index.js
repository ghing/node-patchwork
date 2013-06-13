var EventEmitter = require('events').EventEmitter;
var util = require('util');

var drivers = {};
var registry = {};

function Input(id, opts) {
  Input.super_.call(this);
  this.id = id;
  this.options = opts;
}
util.inherits(Input, EventEmitter);

function TwilioSmsInput(id, opts) {
  TwilioSmsInput.super_.call(this, id, opts);
}
util.inherits(TwilioSmsInput, Input);

TwilioSmsInput.driverName = "Twilio SMS";
TwilioSmsInput.driverId = "twilio-sms";

TwilioSmsInput.prototype.contributeRoutes = function(app) {
  var input = this;

  // Handler for the SMS Request URL configured for a Twilio phone number
  // POST parameters are documented at
  // http://www.twilio.com/docs/api/twiml/sms/twilio_request
  app.post('/' + this.id + '/twilio-sms-request', function(req, resp) {
    var date = new Date();
    var data = {
      smssid: req.body.SmsSid,
      from: req.body.From, 
      body: req.body.Body,
      date: date.toISOString() 
    };
    console.dir(data);
    input.emit('message', data);

    // If we wanted to send an SMS response, we could, but for now,
    // just send back an empty response
    resp.send('');
  });
};

drivers[TwilioSmsInput.driverId] = TwilioSmsInput;

function create(id, driverId, opts) {
  var inputClass = drivers[driverId];
  var input = new inputClass(id, opts);
  registry[id] = input; 
  return input;
}

function get(id) {
  return registry[id];
}

module.exports = {
  create: create,
  get: get
};
