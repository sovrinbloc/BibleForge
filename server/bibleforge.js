/**
 * BibleForge
 *
 * @date    05-15-12
 * @version alpha (α)
 * @link    http://BibleForge.com
 * @license GNU Affero General Public License 3.0 (AGPL-3.0)
 * @author  BibleForge <info@bibleforge.com>
 */

"use strict";

var BF = {
    fs: require("fs")
};

function start_server()
{
    var handle_query = (function ()
    {
        return function handle_query(path, data, connection)
        {
            /// Is the request for the API's?
            if (path === "/api") {
                switch (Number(data.t)) {
                    case BF.consts.verse_lookup:
                        BF.lookup(data, connection);
                        break;
                    case BF.consts.standard_search:
                        connection.end("test " + (new Date()).getTime());
                        break;
                    case BF.consts.grammatical_search:
                        connection.end("test " + (new Date()).getTime());
                        break;
                    case BF.consts.lexical_lookup:
                        BF.lexical_lookup(data, connection);
                        break;
                    default:
                        connection.end("test " + (new Date()).getTime());
                }
            } else {
                /// Is the request for the normal full version?
                /// Googlebot converts hash bangs (#!) into "?_escaped_fragment_=", so URIs with this in it should also be sent to the basic version.
                if (path.substr(-1) !== "!" && (!data || !data["_escaped_fragment_"])) {
                    /// Just send it the HTML of index.html.
                    connection.writeHead(200, {"Content-Type": "text/html"});
                    
                    ///FIXME: Cache index.html and modified time.  (Make an option to not cache the data for development purposes).
                    ///TODO:  Optionally send a gzipped version.
                    ///TODO:  Check headers for the presence of a cached copy.
                    BF.fs.readFile(BF.config.static_path + "index.html", "utf8", function (err, data)
                    {
                        connection.end(data);
                    });
                } else {
                    ///TODO: Build a non-JavaScript version.
                }
            }
        }
    }());
    
    (function ()
    {
        var url = require("url"),
            qs  = require("querystring");
        
        require('http').createServer(function (request, response)
        {
            ///TODO: Determine if there the connection should be able to timeout.
            /// Give an object with a subset of the response's functions.
            var connection = {
                end: function (data, encoding)
                {
                    response.end(data, encoding);
                },
                write: function (chunk, encoding)
                {
                    response.write(chunk, encoding);
                },
                writeHead: function (statusCode, headers)
                {
                    response.writeHead(statusCode, headers);
                }
            }, url_parsed = url.parse(request.url);
            
            /// Is there GET data?
            ///TODO: Merge POST data with GET data.
            if (request.method === "GET") {
                handle_query(url_parsed.pathname, qs.parse(url_parsed.query), connection);
            } else {
                ///TODO: Also handle POST data.
                /// If there is no data, close the connection.
                connection.end();
            }
        }).listen(7777);
    }());
}

BF.config = require("./config.js").config;

///TODO: This needs to be linked to the client side code.
BF.consts = {
    /// Query type "constants"
    verse_lookup:       1,
    mixed_search:       2,
    standard_search:    3,
    grammatical_search: 4,
    lexical_lookup:     5,
    
    /// Direction "constants"
    additional: 1,
    previous:   2
};



BF.db = (function ()
{
    var db = new (require("db-mysql")).Database({
        hostname: BF.config.db.host,
        user:     BF.config.db.user,
        password: BF.config.db.pass,
        database: BF.config.db.base,
        async: false
    });
    
    db.connect({async: false});
        
    db.query().execute("SET NAMES 'utf8'", {async: false});
    
    return {
        escape: function (str)
        {
            return db.escape(str);
        },
        name: function (str)
        {
            return db.name(str);
        },
        query: function (sql, callback)
        {
            db.query().execute(sql, [], function (err, data)
            {
                if (typeof callback === "function") {
                    callback(data, err);
                }
            });
        }
    };
}());

BF.lookup = function (data, connection)
{
    var extra_fields,
        direction = data.d ? Number(data.d) : BF.consts.additional,
        find_paragraph_start = Boolean(data.f),
        in_paragraphs = data.p ? Boolean(data.d) : true,
        lang = data.l || "en",
        limit,
        operator,
        order_by,
        starting_verse,
        verse_id  = Number(data.q);
    
    /// Send the proper header.
    connection.writeHead(200, {"Content-Type": "application/json"});
    
    /// Quickly check to see if the verse_id is outside of the valid range.
    ///TODO: Determine if verse_id < 1001001 should default to 1001001 and verse_id > 66022021 to 66022021.
    ///TODO: 66022021 may need to be language dependent because different languages have different verse breaks.
    /// Also, check to see if the language specified is valid.
    if (verse_id < 1001001 || verse_id > 66022021 || !BF.langs[lang]) {
        connection.end("{}");
        return;
    }
    
    ///NOTE: To get PREVIOUS verses, we need to sort the database by id in reverse order because
    ///      chapter and book boundaries are not predictable (i.e., we can't just say "WHERE id >= id - LIMIT").
    
    if (direction === BF.consts.additional) {
        operator = ">=";
        order_by = "";
    } else {
        operator = "<=";
        ///NOTE: Leading space is needed in case the preceding variable does end with whitespace.
        order_by = " ORDER BY id DESC";
    }
    
    if (in_paragraphs) {
        /// The limit must be set to the minimum length of the longest paragraph because paragraphs cannot be split.
        limit = BF.langs[lang].paragraph_limit;
        extra_fields = ", paragraph";
    } else {
        limit = BF.langs[lang].minimum_desired_verses;
        extra_fields = "";
    }
    
    if (find_paragraph_start) {
        /// Create a subquery that will return the nearest verse that is at a paragraph break.
        ///NOTE: Currently, find_paragraph_start is never true when direction === BF.consts.previous because previous lookups always start at a paragraph break.
        ///      In order to find the correct starting verse when looking up in reverse, the comparison operator (<=) would need to be greater than or equal to (>=),
        ///      and 1 would need to be subtracted from the found starting id.
        starting_verse = "(SELECT id FROM `bible_" + lang + "_html` WHERE id <= " + verse_id + " AND paragraph = 1 ORDER BY id DESC LIMIT 1)";
    } else {
        starting_verse = verse_id;
    }
    
    BF.db.query("SELECT id, words" + extra_fields + " FROM `bible_" + lang + "_html` WHERE id " + operator + starting_verse + order_by + " LIMIT " + limit, function (data)
    {
        var break_after,
            i,
            len,
            res = {
                n: [],
                v: []
            };
        
        /// Was there no response from the database?  This could mean the database crashed.
        if (!data) {
            /// Send a blank response, and exit.
            connection.end("{}");
            return;
        }
        
        len = data.length - 1;
        
        if (in_paragraphs) {
            res.p = [];
            
            for (i = 0; i < len; i += 1) {
                /// Is it at a paragraph break and did it find enough verses to send to the client?
                if (data[i].paragraph && i >= BF.langs[lang].minimum_desired_verses) {
                    /// The first verse should be at a paragraph beginning, and the last verse
                    /// should be just before one. Therefore, when looking up previous verses,
                    /// we must get this verse (because previous lookups are in reverse).
                    /// So, additional lookups should stop now because the next verse is at the
                    /// beginning of a paragraph, but previous lookups need to get this last verse,
                    /// which is actually the first verse (because the arrays will be reversed shortly).
                    if (direction === BF.consts.additional) {
                        break;
                    }
                    break_after = true;
                }
                
                res.n[i] = data[i].id;
                res.v[i] = data[i].words;
                res.p[i] = Number(data[i].paragraph);
                
                if (break_after) {
                    break;
                }
            }
        } else {
            for (i = 0; i < len; i += 1) {
                res.n[i] = data[i].id;
                res.v[i] = data[i].words;
            }
        }
        
        if (direction === BF.consts.previous) {
            /// Because the database returns the verses in reverse order when preforming a previous lookup, they need to be reordered.
            ///NOTE: Because in paragraph mode, there is no way to know how many verses will be returned, it cannot simply put the verses in the array in reverse order above.
            res.n.reverse();
            res.v.reverse();
            if (res.p) {
                res.p.reverse();
            }
        }
        
        res.t = res.n.length;
        
        connection.end(JSON.stringify(res));
    });
};

BF.lexical_lookup = function (data, connection)
{
    var lang = data.l || "en",
        query,
        word_id = Number(data.q);
    
    /// Is the language invalid?
    if (!BF.langs[lang]) {
        connection.end("{}");
        return;
    }
    
    /// Is it an Old Testament word?
    if (word_id < BF.langs[lang].divisions.nt) {
        query = "SELECT `bible_original`.word, `bible_original`.pronun, `lexicon_hebrew`.strongs, `lexicon_hebrew`.base_word, `lexicon_hebrew`.data, `lexicon_hebrew`.usage FROM `bible_" + lang + "`, `bible_original`, `lexicon_hebrew`, `morphology` WHERE `bible_" + lang + "`.id = " + word_id + " AND `bible_original`.id = `bible_" + lang + "`.orig_id AND lexicon_hebrew.strongs = `bible_original`.strongs LIMIT 1";
    } else {
        query = "SELECT `bible_original`.word, `bible_original`.pronun, `lexicon_greek`.strongs, `lexicon_greek`.base_word, `lexicon_greek`.data, `lexicon_greek`.usage, `morphology`.part_of_speech, `morphology`.declinability, `morphology`.case_5, `morphology`.number, `morphology`.gender, `morphology`.degree, `morphology`.tense, `morphology`.voice, `morphology`.mood, `morphology`.person, `morphology`.middle, `morphology`.transitivity, `morphology`.miscellaneous, `morphology`.noun_type, `morphology`.numerical, `morphology`.form, `morphology`.dialect, `morphology`.type, `morphology`.pronoun_type FROM `bible_" + lang + "`, `bible_original`, `lexicon_greek`, `morphology` WHERE `bible_" + lang + "`.id = " + word_id + " AND `bible_original`.id = `bible_" + lang + "`.orig_id AND lexicon_greek.strongs = `bible_original`.strongs AND `morphology`.id = `bible_original`.id LIMIT 1";
    }
    
    ///FIXME: Currently, BibleForge links words to the lexicon by Strong's numbers; however, this is too simplistic because some Strong's numbers have multiple entries.
    ///       So, there needs to be another identifier.
    BF.db.query(query, function (data)
    {
        /// Was there no response from the database?  This could mean the database crashed.
        if (!data) {
            /// Send a blank response, and exit.
            connection.end("{}");
            return;
        }
        
        ///NOTE: Currently, only one results is requested, so it can simply send data[0].
        ///      In the future, it should return multiple results for some words (e.g., hyphenated words).
        connection.end(JSON.stringify(data[0]));
    });
};

/// Pepare the langs object for the languages to attach to.
BF.langs = {};

/// Load the languages
(function ()
{
    /**
     * Eval code in a neutral scope.
     *
     * @param  code (string) The string to eval.
     * @return The result of the eval'ed code.
     * @note   This is used to prevent included code from having access to the variables inside of the function's scope.
     */
    function evaler(code)
    {
        return eval(code);
    }
    
    (function ()
    {
        function include(path, context, callback, timeout, retry)
        {
            BF.fs.readFile(path, "utf8", function (err, data)
            {
                var code = evaler(data);
                
                if (code === "function") {
                    code(context);
                }
                
                if (typeof callback === "function") {
                    callback(err);
                }
            });
        }
        
        BF.fs.readdir(BF.config.static_path + "js/lang/", function (err, files)
        {
            var len = files.length;
            
            (function load_file(i)
            {
                if (i === len) {
                    /// Now that every this is loaded, start the server.
                    ///TODO: Start the server first, but make it wait for the rest to load.
                    start_server();
                } else {
                    include(BF.config.static_path + "js/lang/" + files[i], null, load_file(i + 1));
                }
            }(0));
        });
     }());   
}());
