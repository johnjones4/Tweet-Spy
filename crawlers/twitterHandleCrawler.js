'use strict';

var request = require('request');
var async = require('async');
var querystring = require('querystring');
var Handle = require('../models/handle');

class TwitterHandleCrawler {
  constructor(config,handle,crawlType,depth) {
    this.config = config;
    this.handle = handle;
    this.crawlType = crawlType;
    this.depth = depth;
  }

  crawl(done) {
    var _this = this;
    async.waterfall([
      function(next) {
        _this.enqueueHandles(_this.handle,_this.depth,next);
      },
      function(next) {
        _this.beginDequeue(next);
      }
    ],done);
  }

  enqueueHandles(handle,atDepth,done) {
    var _this = this;
    var depthKey = _this.crawlType + 'Depth';
    async.waterfall([
      function(next) {
        var users = [];
        var makeRequest = function(cursor) {
          console.log('Get ' + _this.crawlType + ' of ' + handle + ' (' + cursor + ')');
          var url = 'https://api.twitter.com/1.1/' + _this.crawlType + '/list.json?' + querystring.stringify({
            'screen_name': handle,
            'count': 200,
            'cursor': cursor
          });
          var oauth = {
            'consumer_key': _this.config.twitter.consumerKey,
            'consumer_secret': _this.config.twitter.consumerSecret,
            'token': _this.config.twitter.token,
            'token_secret': _this.config.twitter.tokenSecret
          };
          request.get({'url':url, 'oauth':oauth, 'json': true}, function(err, response, body) {
            if (err) {
              next(err);
            } else {
              if (body && body.users) {
                users = users.concat(body.users);
              }
              if (body && body.next_cursor && body.next_cursor > 0) {
                makeRequest(body.next_cursor);
              } else {
                next(null,users);
              }
            }
          });
        }
        makeRequest(-1);
      },
      function(users,next) {
        if (users) {
          next(null,users
            .map(function(user) {
              console.log('Found ' + _this.crawlType + ' ' + user.screen_name);
              var handle = new Handle({
                'handle': user.screen_name,
                'twitterId': user.id,
                'follows': user.friends_count != null ? user.friends_count : 0,
                'followers': user.followers_count != null ? user.followers_count : 0,
                'name': user.name,
                'image': user.profile_image_url_https,
                'url': user.url,
                'location': user.location
              });
              handle[depthKey] = atDepth;
              return handle;
            })
          );
        } else {
          next(null,[]);
        }
      },
      function(handles,next) {
        async.series(
          handles.map(function(handle) {
            return function(next1) {
              handle.findDuplicateInDatabase(function(err,dupeHandle) {
                if (dupeHandle) {
                  console.log(_this.crawlType + ' ' + handle.handle + ' is already in database.');
                  dupeHandle[depthKey] = atDepth;
                  dupeHandle.save(function(err) {
                    console.log(_this.crawlType + ' ' + dupeHandle.handle + ' updated in database.');
                    next1(err);
                  });
                } else {
                  handle.save(function(err) {
                    console.log(_this.crawlType + ' ' + handle.handle + ' saved to database.');
                    next1(err);
                  })
                }
              });
            }
          }),
          next
        );
      }
    ],function(err) {
      done(err);
    });
  }

  beginDequeue(done) {
    var _this = this;
    var queue = async.queue(function(handle,next) {
      var depthKey = _this.crawlType + 'Depth';
      var depthString = ' ' + handle.handle + ' (Type: ' + _this.crawlType + ', Depth: ' + handle[depthKey] + ')';
      console.log('Dequeued ' + depthString);
      async.waterfall([
        function(next1) {
          handle.correctTwitterURL(function(err) {
            console.log('Updated URL for ' + depthString);
            next1(err);
          });
        },
        function(next1) {
          if (handle[depthKey] > 0) {
            _this.enqueueHandles(handle.handle,handle[depthKey] - 1,function(err) {
              console.log('Enqueued connections for ' + depthString);
              next1(err);
            });
          } else {
            next1();
          }
        },
        function(next1) {
          var key = _this.crawlType + 'Processed';
          handle[key] = true;
          handle.save(function(err) {
            console.log('Saved ' + depthString);
            next1(err);
          })
        }
      ],next);
    },10);
    var fillQueue = function(err) {
      Handle.findUnprocessedHandles(_this.crawlType,function(err,handles) {
        if (err) {
          done(err);
        } else if (handles && handles.length > 0) {
          handles.forEach(function(handle) {
            queue.push(handle,function(err) {
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
}

module.exports = TwitterHandleCrawler;
