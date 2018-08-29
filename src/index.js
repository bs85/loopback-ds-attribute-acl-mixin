'use strict'

const mixin = require('./attribute-acl')

module.exports = function mixin(app) {
    app.loopback.modelBuilder.mixins.define('AttributeAcl', mixin);
}
