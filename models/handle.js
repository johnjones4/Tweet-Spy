'use strict';

var urlExpander = require('expand-url');

class Handle {
  constructor(props) {
    var _this = this;
    ['id','handle','twitterId','follows','followers','name','image','url','location','email','created','updated'].forEach(function(prop) {
      _this[prop] = props[prop] ? props[prop] : null;
    });
    if (!_this.created) {
      _this.created = new Date();
    }
    if (!_this.updated) {
      _this.updated = new Date();
    }
  }

  isDuplicateInDatabase(done) {
    Handle.knex
      .select(Handle.selectColumns)
      .from(Handle.tableName)
      .where({'handle':this.handle})
      .asCallback(function(err,rows) {
        done(err,(rows && rows.length > 0));
      });
  }

  correctTwitterURL(done) {
    var _this = this;
    if (_this.url) {
      urlExpander.expand(this.url,function(err, longUrl){
        if (longUrl) {
          _this.url = longUrl;
        }
        done();
      });
    } else {
      done();
    }
  }

  save(done) {
    var _this = this;
    var data = {
      'handle': _this.handle,
      'twitter_id': _this.twitterId,
      'follows': _this.follows,
      'followers': _this.followers,
      'name': _this.name,
      'image': _this.image,
      'url': _this.url,
      'location': _this.location,
      'email': _this.email,
      'created_at': _this.created,
      'updated_at': _this.updated
    };

    if (this.id) {
      Handle.table()
        .where({
          'id': this.id
        })
        .update(data)
        .asCallback(function(err,resp) {
          done(err,_this);
        });
    } else {
      Handle.table()
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

Handle.tableName = 'handle';

Handle.selectColumns = ['id','handle','twitter_id','follows','followers','name','image','url','location','email','created','updated'];

Handle.findHandleByHandleName = function(handle,done) {
  Handle.knex
    .select(Handle.selectColumns)
    .from(Handle.tableName)
    .where({'handle':handle})
    .asCallback(function(err,rows) {
      if (err) {
        done(err);
      } else if (rows && rows.length > 0) {
        done(null,Handle.objectFromSQLRow(rows[0]));
      } else {
        done();
      }
    });
};

Handle.findHandleByID = function(id,done) {
  Handle.knex
    .select(Handle.selectColumns)
    .from(Handle.tableName)
    .where({'id':id})
    .asCallback(function(err,rows) {
      if (err) {
        done(err);
      } else if (rows && rows.length > 0) {
        done(null,Handle.objectFromSQLRow(rows[0]));
      } else {
        done();
      }
    });
};

Handle.findHandleByHandlesWithURLs = function(done) {
  Handle.knex
    .select(Handle.selectColumns)
    .from(Handle.tableName)
    .whereNot({'url':null})
    .asCallback(function(err,rows) {
      if (err) {
        done(err);
      } else if (rows) {
        done(null,rows.map(function(row) {
          return Handle.objectFromSQLRow(row);
        }));
      } else {
        done();
      }
    });
};

Handle.objectFromSQLRow = function(sqlRow) {
  return new Handle({
    'id': sqlRow.id,
    'handle': sqlRow.handle,
    'twitterId': sqlRow.twitter_id,
    'follows': sqlRow.follows,
    'followers': sqlRow.followers,
    'name': sqlRow.name,
    'image': sqlRow.image,
    'url': sqlRow.url,
    'location': sqlRow.location,
    'email': sqlRow.email,
    'created': sqlRow.created_at,
    'updated': sqlRow.updated_at
  });
};

Handle.table = function() {
  return Handle.knex(Handle.tableName);
};

Handle.buildTable = function(done) {
  Handle.knex.schema.hasTable(Handle.tableName).then(function(exists) {
    if (!exists) {
      Handle.knex.schema.createTableIfNotExists(Handle.tableName, function(table) {
        table.increments('id').primary();
        table.string('handle',255).notNullable().unique().index();
        table.integer('twitter_id').notNullable().unique().unsigned().index();
        table.integer('follows').unsigned();
        table.integer('followers').unsigned();
        table.string('name',255);
        table.string('image',255);
        table.string('url',255);
        table.string('location',255);
        table.string('email',255);
        table.timestamps();
      }).asCallback(done);
    } else {
      done();
    }
  });
};

module.exports = Handle;
