var trie = require("./trie.js");
var redis = require("redis");
var log = require("winston");

var DEFAULT_HOST = process.env.REDIS_HOST || "127.0.0.1";
var DEFAULT_PORT = process.env.REDIS_PORT || 6379;
var DEFAULT_DB   = process.env.REDIS_DB || 3;

function createClient (host, port, db) {
  var client = redis.createClient(
    port || DEFAULT_PORT,
    host || DEFAULT_HOST
  );

  if (db || 0 !== DEFAULT_DB) {
    client.select(db);
  }

  return client;
}

function scrub (data) {
  if (data && data.last_activity) {
    // save as ISO string
    data.last_activity = data.last_activity.toISOString();
  }

  return data;
}

var NotImplemented = function (name) {
  return {
    name: "NotImplementedException",
    message: "method '" + name + "' not implemented"
  };
};

var BaseStore = Object.create(Object.prototype, {
  // "abstract" methods
  get:       { value: function () { throw NotImplemented("get"); } },
  getTarget: { value: function () { throw NotImplemented("getTarget"); } },
  getAll:    { value: function () { throw NotImplemented("getAll"); } },
  add:       { value: function () { throw NotImplemented("add"); } },
  update:    { value: function () { throw NotImplemented("update"); } },
  remove:    { value: function () { throw NotImplemented("remove"); } },
  hasRoute:  { value: function () { throw NotImplemented("hasRoute"); } },

  cleanPath: {
    value: function (path) {
      return trie.trim_prefix(path);
    }
  },

  notify: {
    value: function (cb) {
      if (typeof(cb) === "function") {
        var args = Array.prototype.slice.call(arguments, 1);
        cb.apply(this, args);
      }
    }
  }
});

function MemoryStore () {
  var routes = {};
  var urls   = new trie.URLTrie();
  var redis_client = createClient(DEFAULT_HOST, DEFAULT_PORT, DEFAULT_DB);

  return Object.create(BaseStore, {
    get: {
      value: function (path, cb) {
        var that = this;
        log.debug("get path :", path);
        var rootPath = "/" + (path || "/").split("/")[1];
        log.debug("get rootpath :", rootPath);

        redis_client.hgetall(rootPath, function(err, res) {
          value = { prefix: rootPath, data: res }
          that.notify(cb, res);
        });
      }
    },
    getTarget: {
      value: function (path, cb) {
        var that = this;
        log.debug("getTarget path :", path);

        var rootPath = "/" + (path || "/").split("/")[1];
        log.debug("get rootpath :", rootPath);

        redis_client.hgetall(rootPath, function(err, res) {
          value = { prefix: rootPath, data: res }
          that.notify(cb, value);
        });
      }
    },
    getAll: {
      value: function (cb) {
        log.debug("getAll path :", path);
        this.notify(cb, routes);
      }
    },
    add: {
      value: function (path, data, cb) {
        var that = this;
        log.debug("add path :", path, " data: ", data);

        redis_client.hmset(path, data, function(err, res) {
            that.notify(cb)
        });
      }
    },
    update: {
      value: function (path, data, cb) {
        var that = this;
        log.debug("update path :", path, " data:" , data);

        this.get(path, function(current) {
            log.debug("current :" , current);
            redis_client.hmset(path, data, function(err, res) {
                that.notify(cb);
            });
        });
      }
    },
    remove: {
      value: function (path, cb) {
        delete routes[path];
        urls.remove(path);
        this.notify(cb);
      }
    },
    hasRoute: {
      value: function (path, cb) {
        log.debug("hasRoute path :", path);
		var that = this;

		redis_client.exists(path, function(err, res) {
			log.debug("Returning :", res === 1);
        	that.notify(cb, res === 1);
		});
      }
    }
  });
}

exports.MemoryStore = MemoryStore;
