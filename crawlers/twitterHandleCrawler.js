'use strict';

var request = require('request');
var async = require('async');
var querystring = require('querystring');
var Handle = require('../models/handle');

class TwitterHandleCrawler {
  constructor(config,handle) {
    this.config = config;
    this.handle = handle;
  }

  crawl(done) {
    this._crawl(this.handle,this.config.twitter.crawlDepth,done);
  }

  _crawl(handle,depth,done) {
    var _this = this;
    async.waterfall([
      function(next) {
        var users = [];
        var makeRequest = function(cursor) {
          console.log('Get ' + _this.config.twitter.crawlType + ' of ' + handle + ' (' + cursor + ')');
          var url = 'https://api.twitter.com/1.1/' + _this.config.twitter.crawlType + '/list.json?' + querystring.stringify({
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
              console.log('Found ' + _this.config.twitter.crawlType + ' ' + user.screen_name);
              return new Handle({
                'handle': user.screen_name,
                'twitterId': user.id,
                'follows': user.friends_count != null ? user.friends_count : 0,
                'followers': user.followers_count != null ? user.followers_count : 0,
                'name': user.name,
                'image': user.profile_image_url_https,
                'url': user.url,
                'location': user.location
              });
            })
          );
        } else {
          next(null,[]);
        }
      },
      function(handles,next) {
        async.filterSeries(
          handles,
          function(handle,next1) {
            async.waterfall([
              function(next2) {
                handle.isDuplicateInDatabase(next2);
              },
              function(dupe,next2) {
                if (!dupe) {
                  handle.correctTwitterURL(function(err) {
                    console.log('Updated URL for ' + _this.config.twitter.crawlType + ' ' + handle.handle);
                    next2(err);
                  });
                } else {
                  console.log(_this.config.twitter.crawlType + ' ' + handle.handle + ' is already in database.');
                  next1(false);
                }
              },
              function(next2) {
                handle.save(function(err) {
                  console.log('Saved ' + _this.config.twitter.crawlType + ' ' + handle.handle);
                  next2(err,true);
                });
              }
            ],next1);
          },
          next
        );
      }
    ],function(err,handles) {
      if (err) {
        done(err);
      } else if (handles && depth > 0) {
        async.series(
          handles.map(function(handle) {
            return function(next) {
              _this._crawl(handle.handle,depth-1,next);
            }
          }),
          done
        );
      } else {
        done();
      }
    });
  }
}

module.exports = TwitterHandleCrawler;
