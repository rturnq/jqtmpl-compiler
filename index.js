'use strict'

var jqTmpl = require('./lib/jquery.tmpl.core');
var $ = require('cheerio');
var htmlclean = require('htmlclean');
var extend = require('extend');

var rxNestedTemplates = /{{tmpl(\(.*\))?\s+["']#?([^'\"]+)['"]\s*}}/g,
    rxExcludedScripts = /^text\/(javascript)$/i;

function returnTrue() {
    return true;
}

function noop() {}

function nestedResolver(name) {
    return "exports['" + name + "']";
}

function nameResolver(script) {
    return script.attr('id');
}

function scriptFilter(script) {
    var type = script.attr('type');
    return !!type && !rxExcludedScripts.test(type);
}

function preProcess(source) {
    return source;
}

function postProcess(template) {
    var base = Function.prototype.toString;

    template.toString = function () {
        return base.call(this).replace('function anonymous(', 'function (').replace(/\n+/g, '');
    };

    return template;
}

Compiler.defaults = {
    cleanSource: true,
    scriptFilter: scriptFilter,
    nameResolver: nameResolver,
    nestedResolver: nestedResolver,
    preProcess: preProcess,
    postProcess: postProcess
};

function Compiler(opts) {
    this.opts = extend({}, Compiler.defaults, opts);
}

Compiler.prototype.compile = function (source, opts) {
    var template;

    opts = extend({}, Compiler.defaults, this.opts, opts);

    if (opts.cleanSource) {
        source = htmlclean(source);
    }

    if (typeof opts.preProcess === 'function') {
        source = opts.preProcess(source);
        if (typeof source !== 'string') {
            throw new Error('preProcess function was expected to return a string but returned ' + source);
        }
    }

    if (typeof opts.nestedResolver === 'function') {
        source = source.replace(rxNestedTemplates, function (m, data, name) {
            return '{{tmpl'+ (data || '') + ' ' + (opts.nestedResolver(name) || name) + '}}';
        });
    }

    template = jqTmpl.template(source);

    if (typeof opts.postProcess === 'function') {
        template = opts.postProcess(template);
        if (typeof template !== 'function') {
            throw new Error('postProcess function was expected to return a function but returned ' + template);
        }
    }

    return template;
};

Compiler.prototype.extractScripts = function (html, opts) {
    var _this = this,
        unnamedCount = 0;

    html = html.toString();
    opts = extend({}, Compiler.defaults, this.opts, opts);

    if (typeof opts.nameResolver !== 'function') {
        opts.nameResolver = noop;
    }
    if (typeof opts.filter !== 'function') {
        opts.filter = returnTrue;
    }

    return $.load(html)('script').map(function () {
        return $(this);
    }).get().filter(opts.scriptFilter).map(function (script) {
        return {
            name: opts.nameResolver(script) || 'Template_' + (++unnamedCount),
            template: _this.compile(script.html(), opts)
        };
    }).sort(function (a, b) {
        return a.name > b.name ? 1 :
               a.name < b.name ? -1 : 0;
    });
};

module.exports = Compiler;
