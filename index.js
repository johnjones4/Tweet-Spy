var async = require('async');
var config = require('./config');
var Handle = require('./models/handle');
var Page = require('./models/page');
var TwitterHandleCrawler = require('./crawlers/twitterHandleCrawler');
var SiteEmailCrawler = require('./crawlers/siteEmailCrawler');
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
          var crawler = new TwitterHandleCrawler(config,config.twitter.rootHandle,'friends',1);
          crawler.crawl(next);
        },
        function(next) {
          var crawler = new TwitterHandleCrawler(config,config.twitter.rootHandle,'followers',0);
          crawler.crawl(next);
        },
        function(next) {
          var crawler = new SiteEmailCrawler(config);
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
