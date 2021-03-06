var async = require('async');
var config = require('./config');
var Handle = require('./models/handle');
var Page = require('./models/page');
var TwitterHandleCrawler = require('./crawlers/twitterHandleCrawler');
var SiteEmailCrawler = require('./crawlers/siteEmailCrawler');
var knex = require('knex')(config.knex);
var winston = require('winston');

var logger = new (winston.Logger)({
  'transports': [
    new (winston.transports.Console)({'timestamp':true})
  ]
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
      async.parallel([
        function(next) {
          async.waterfall([
            function(next1) {
              if (config.twitter.depths.friends >= 0) {
                var crawler = new TwitterHandleCrawler(logger,config,config.twitter.rootHandles,'friends',config.twitter.depths.friends);
                crawler.crawl(next1);
              } else {
                next1();
              }
            },
            function(next1) {
              if (config.twitter.depths.followers >= 0) {
                var crawler = new TwitterHandleCrawler(logger,config,config.twitter.rootHandles,'followers',config.twitter.depths.followers);
                crawler.crawl(next1);
              } else {
                next1();
              }
            }
          ],next);
        },
        function(next) {
          var crawler = new SiteEmailCrawler(logger,config);
          crawler.crawl(next);
        }
      ],function(err) {
        if (err) {
          console.trace(err);
          process.exit(-1);
        } else {
          process.exit(0);
        }
      });
    }
  }
);
