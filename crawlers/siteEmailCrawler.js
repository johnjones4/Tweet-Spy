'use strict';

var request = require('request');
var async = require('async');
var querystring = require('querystring');
var Handle = require('../models/handle');
var Page = require('../models/page');
var jsdom = require("jsdom");
var url = require('url');

class SiteEmailCrawler {
  constructor(config) {
    this.config = config;
  }

  crawl(done) {
    var _this = this;
    async.waterfall([
      function(next) {
        _this.enqueueHandleURLs(next);
      },
      function(next) {
        _this.beginDequeue(next);
      }
    ],done);
  }

  enqueueHandleURLs(done) {
    var _this = this;
    async.waterfall([
      function(next) {
        Handle.findHandleByHandlesWithURLs(next);
      },
      function(handles,next) {
        next(null,handles.map(function(handle) {
          return new Page({
            'url': handle.url,
            'handle': handle.id
          });
        }));
      },
      function(pages,next) {
        _this.enqueuePages(pages,next);
      }
    ],function(err) {
      done(err);
    });
  }

  beginDequeue(done) {
    var _this = this;
    var queue = async.queue(function(page,next) {
      console.log('Dequeued ' + page.url);
      _this.crawURLForEmail(page.url,function(err,email) {
        if (err) {
          next(err);
        } else if (email) {
          console.log('Found email on ' + page.url + ' (' + email + ')');
          async.waterfall([
            function(next1) {
              Handle.findHandleByID(page.handle,next1);
            },
            function(handle,next1) {
              if (handle) {
                handle.email = email;
                handle.save(function(err) {
                  next1(err);
                });
              } else {
                next(new Error('Handle ' + page.handle + ' is missing.'));
              }
            },
            function(next1) {
              page.crawled = true;
              page.save(function(err) {
                next1(err);
              });
            }
          ],function(err) {
            next(err);
          });
        } else {
          console.log('No emails found on ' + page.url);
          async.waterfall([
            function(next1) {
              page.crawled = true;
              page.save(function(err) {
                next1(err);
              });
            },
            function(next1) {
              _this.crawURLForSameDomainURLs(page.url,next1);
            },
            function(urls,next1) {
              var pages = urls.map(function(url) {
                return new Page({
                  'url': url,
                  'handle': page.handle
                });
              });
              _this.enqueuePages(pages,next1);
            },
          ],function(err) {
            next(err);
          });
        }
      });
    },10);
    var fillQueue = function(err) {
      Page.fundUncrawledPages(function(err,pages) {
        if (err) {
          done(err);
        } else if (pages && pages.length > 0) {
          pages.forEach(function(page) {
            queue.push(page,function(err) {
              if (err) {
                console.error(err);
              }
            });
          });
          queue.drain(fillQueue);
        } else {
          done();
        }
      });
    }
    fillQueue();
  }

  crawURLForEmail(url,done) {
    request(url,function(err,response,body) {
      if (err) {
        done(err);
      } else {
        var emails = body.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/gi);
        if (emails && emails.length > 0) {
          var filtered = emails.filter(function(email) {
            return !email.endsWith('.png') && !email.endsWith('.jpg') && !email.endsWith('.gif');
          });
          if (filtered && filtered.length > 0) {
            done(null,filtered[0]);
          } else {
            done();
          }
        } else {
          done();
        }
      }
    })
  }

  crawURLForSameDomainURLs(pageURL,done) {
    var pageURLObj = url.parse(pageURL);
    jsdom.env(
      pageURL,
      function (err, window) {
        if (err) {
          done(err);
        } else {
          var linksElements = window.document.querySelectorAll('a');
          var pages = [];
          for(var i = 0; i < linksElements.length; i++) {
            var link = url.parse(linksElements[0].href);
            if (link.host == pageURLObj.host) {
              pages.push(link.href);
            }
          }
          done(null,pages);
        }
      }
    );
  }

  enqueuePages(pages,done) {
    async.series(
      pages.map(function(page) {
        return function(next) {
          async.waterfall([
            function(next1) {
              page.isDuplicateInDatabase(next1);
            },
            function(dupe,next1) {
              if (!dupe) {
                console.log('Enqueued ' + page.url);
                page.save(next1);
              } else {
                next1();
              }
            }
          ],next);
        }
      }),
      done
    );
  }

}

module.exports = SiteEmailCrawler;
