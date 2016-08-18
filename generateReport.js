var async = require('async');
var config = require('./config');
var Handle = require('./models/handle');
var Page = require('./models/page');
var TwitterHandleCrawler = require('./crawlers/twitterHandleCrawler');
var SiteEmailCrawler = require('./crawlers/siteEmailCrawler');
var stringify = require('csv-stringify');
var knex = require('knex')(config.knex);

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
          var query = Handle.findCompleteProfiles(config.report.locations,next);
          console.log(query)
        },
        function(handles,next) {
          stringify(handles,{'header':true},next)
        },
        function(csv,next) {
          fs.writeFile(config.report.file,csv,next);
        }
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
