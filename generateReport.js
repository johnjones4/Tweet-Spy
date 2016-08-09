var async = require('async');
var config = require('./config');
var Handle = require('./models/handle');
var Page = require('./models/page');
var TwitterHandleCrawler = require('./crawlers/twitterHandleCrawler');
var SiteEmailCrawler = require('./crawlers/siteEmailCrawler');
var stringify = require('csv-stringify');
var knex = require('knex')({
  'client': 'sqlite3',
  'connection': {
    'filename': config.db_file
  }
});

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
          Handle.findCompleteProfiles(config.report.locations,next);
        },
        function(handles,next) {
          stringify(handles,next)
        }
      ],function(err,csvData) {
        if (err) {
          console.error(err);
          process.exit(-1);
        } else {
          console.log(csvData);
          process.exit(0);
        }
      });
    }
  }
);
