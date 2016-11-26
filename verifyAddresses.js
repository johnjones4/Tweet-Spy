var async = require('async');
var config = require('./config');
var Handle = require('./models/handle');
var Page = require('./models/page');
var knex = require('knex')(config.knex);
var request = require('request');
var querystring = require('querystring');

async.series(
  [Handle,Page].map(function(klass) {
    return function(next) {
      klass.knex = knex;
      klass.buildTable(next);
    }
  }),
  function(err) {
    if (err) {
      console.trace(err);
      process.exit(-1);
    } else {
      async.waterfall([
        function(next) {
          var query = Handle.findUnverifiedProfiles(config.report.locations,next);
          console.log(query)
        },
        function(handles,next) {
          async.series(
            handles.map(function(handle) {
              return function(next1) {
                console.log('Checking ' + handle.email);
                async.waterfall([
                  function(next2) {
                    handle.dateEmailVerified = new Date();
                    handle.save(function(err) {
                      next2(err);
                    });
                  },
                  function(next2) {
                    var url = 'http://api.verify-email.org/api.php?' + querystring.stringify({
                      'usr': config.verifyEmail.username,
                      'pwd': config.verifyEmail.password,
                      'check': handle.email
                    });
                    request({'url': url, 'json': true},function(err,response) {
                      next2(err,response);
                    });
                  },
                  function(response,next2) {
                    if (response && response.body) {
                      if (response.body.limit_status > 0) {
                        next2(new Error('Limit reached'))
                      } else {
                        console.log(handle.email + ': ' + response.body.verify_status);
                        handle.emailVerified = response.body.verify_status;
                        handle.save(function(err) {
                          next2(err);
                        });
                      }
                    } else {
                      next2();
                    }
                  }
                ],next1);
              }
            })
          )
        },
      ],function(err,csvData) {
        if (err) {
          console.error(err);
          process.exit(-1);
        } else {
          process.exit(0);
        }
      });
    }
  }
);
