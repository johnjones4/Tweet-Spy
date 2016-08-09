'use strict';

var urlExpander = require('expand-url');
var Handle = require('./handle');

class Page {
  constructor(props) {
    var _this = this;
    ['id','url','crawled','handle','created','updated'].forEach(function(prop) {
      _this[prop] = props[prop] ? props[prop] : null;
    });
    if (!_this.crawled) {
      _this.crawled = false;
    }
    if (!_this.created) {
      _this.created = new Date();
    }
    if (!_this.updated) {
      _this.updated = new Date();
    }
  }

  isDuplicateInDatabase(done) {
    Page.knex
      .select(Page.selectColumns)
      .from(Page.tableName)
      .where({'url':this.url})
      .asCallback(function(err,rows) {
        done(err,(rows && rows.length > 0));
      });
  }

  save(done) {
    var _this = this;
    var data = {
      'url': _this.url,
      'crawled': _this.crawled,
      'handle': _this.handle.id || _this.handle,
      'created_at': _this.created,
      'updated_at': _this.updated
    };

    if (this.id) {
      Page.table()
        .where({
          'id': this.id
        })
        .update(data)
        .asCallback(function(err) {
          done(err,_this);
        });
    } else {
      Page.table()
        .insert(data)
        .returning('id')
        .asCallback(function(err,inserts) {
          if (err) {
            done(err,_this);
          } else if (inserts.length > 0) {
            _this.id = inserts[0];
            done(null,_this);
          } else {
            done(null,_this);
          }
        });
    }
  }
}

Page.tableName = 'page';

Page.selectColumns = ['id','url','crawled','handle','created_at','updated_at'];

Page.findUncrawledPages = function(done) {
  Page.knex
    .select(Page.selectColumns)
    .from(Page.tableName)
    .where({'crawled':false})
    .asCallback(function(err,rows) {
      if (err) {
        done(err);
      } else if (rows) {
        done(null,rows.map(function(row) {
          return Page.objectFromSQLRow(row);
        }));
      } else {
        done();
      }
    });
};

Page.objectFromSQLRow = function(sqlRow) {
  return new Page({
    'id': sqlRow.id,
    'url': sqlRow.url,
    'crawled': sqlRow.crawled,
    'handle': sqlRow.handle,
    'created': sqlRow.created_at,
    'updated': sqlRow.updated_at
  });
};

Page.table = function() {
  return Page.knex(Page.tableName);
};

Page.buildTable = function(done) {
  Page.knex.schema.hasTable(Page.tableName).then(function(exists) {
    if (!exists) {
      Page.knex.schema.createTableIfNotExists(Page.tableName, function(table) {
        table.increments('id').primary();
        table.string('url',512).notNullable().unique().index();
        table.integer('handle').unsigned().notNullable().references('id').inTable(Handle.tableName);
        table.boolean('crawled');
        table.timestamps();
      }).asCallback(done);
    } else {
      done();
    }
  });
};

module.exports = Page;
