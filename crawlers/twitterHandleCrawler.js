'use strict';

var request = require('request');
var async = require('async');
var querystring = require('querystring');
var Handle = require('../models/handle');

class TwitterHandleCrawler {
  constructor(logger,config,handles,crawlType,depth) {
    this.logger = logger;
    this.config = config;
    this.handles = handles;
    this.crawlType = crawlType;
    this.depth = depth;
    this.initHandleQueue();
  }

  crawl(done) {
    var _this = this;
    async.waterfall([
      function(next) {
        async.parallel(
          _this.handles.map(function(handle) {
            return function(next1) {
              _this.enqueueHandles(handle,_this.depth,next1);
            };
          }),
          function(err) {
            next(err);
          }
        )
      },
      function(next) {
        _this.beginDequeue(next);
      }
    ],function(err) {
      done(err);
    });
  }

  initHandleQueue() {
    var _this = this;
    this.handleQueue = async.queue(function(handleInfo,done) {
      handleInfo.handle.findDuplicateInDatabase(function(err,dupeHandle) {
        if (err) {
          done(err);
        } else if (dupeHandle) {
          _this.logger.info(_this.crawlType + ' ' + handleInfo.handle.handle + ' is already in database.');
          if (handleInfo.atDepth > dupeHandle[handleInfo.depthKey]) {
            dupeHandle[handleInfo.depthKey] = handleInfo.atDepth;
            var processedKey = _this.crawlDepth + 'Processed';
            dupeHandle[processedKey] = false;
            dupeHandle.save(function(err) {
              _this.logger.info(_this.crawlType + ' ' + dupeHandle.handle + ' updated in database.');
              done(err);
            });
          } else {
            done();
          }
        } else {
          handleInfo.handle.save(function(err) {
            _this.logger.info(_this.crawlType + ' ' + handleInfo.handle.handle + ' saved to database.');
            done(err);
          })
        }
      });
    },1);
  }

  enqueueHandles(handle,atDepth,done) {
    var _this = this;
    var depthKey = _this.crawlType + 'Depth';
    async.waterfall([
      function(next) {
        var users = [];
        var makeRequest = function(cursor) {
          _this.logger.info('Get ' + _this.crawlType + ' of ' + handle + ' (' + cursor + ')');
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
                if (body && body.next_cursor && body.next_cursor > 0) {
                  makeRequest(body.next_cursor);
                } else {
                  next(null,users);
                }
              } else {
                _this.logger.info(body);
                setTimeout(function() {
                  makeRequest(cursor);
                },900000);
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
              _this.logger.info('Found ' + _this.crawlType + ' ' + user.screen_name);
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
        handles.forEach(function(handle) {
          var handleInfo = {
            'handle': handle,
            'atDepth': atDepth,
            'depthKey': depthKey
          };
          _this.handleQueue.push(handleInfo,function(err) {
            if (err) {
              _this.logger.error(err);
            }
          })
        });
        next();
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
      _this.logger.info('Dequeued ' + depthString);
      async.waterfall([
        function(next1) {
          handle.correctTwitterURL(function(err) {
            _this.logger.info('Updated URL for ' + depthString);
            next1(err);
          });
        },
        function(next1) {
          if (handle[depthKey] > 0) {
            _this.enqueueHandles(handle.handle,handle[depthKey] - 1,function(err) {
              _this.logger.info('Enqueued connections for ' + depthString);
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
            _this.logger.info('Saved ' + depthString);
            next1(err);
          })
        }
      ],next);
    },10);
    queue.drain = function(err) {
      _this.logger.info('Refilling handle queue');
      Handle.findUnprocessedHandles(_this.crawlType,function(err,handles) {
        if (err) {
          done(err);
        } else if (handles && handles.length > 0) {
          _this.logger.info(handles.length + ' handles queued');
          handles.forEach(function(handle) {
            queue.push(handle,function(err) {
              _this.logger.info('Handle ' + handle.handle + ' done processing');
              if (err) {
                _this.logger.error(JSON.stringify(err,null,'  '));
              }
            });
          });
        } else {
          _this.logger.info('No handles queued');
          done();
        }
      });
    }
    queue.drain();
  }
}

module.exports = TwitterHandleCrawler;
