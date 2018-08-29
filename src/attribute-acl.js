'use strict'

const debug = require('debug')('loopback:mixin:attribute-acl')

const AccessContext = require('loopback/lib/access-context').AccessContext;

const ACTION_RESTRICT = 'RESTRICT';

async function applyAttributeAcls(Model, ctx, next) {
    debug('applyAttributeAcls for model %o (via remote method %o)', Model.name);

    const { instance, currentInstance, data } = ctx;
    const { accessToken } = ctx.options;
    const { ACL } = Model.app.models;

    if (!accessToken) {
        debug('accessToken not found, aborting');
        return;
    }

    debug('instance: %O', instance);
    debug('data: %O', data);
    debug('currentInstance: %O', currentInstance);

    if (!currentInstance) {
        debug('no current instance found, aborting');
        return;
    }

    const attributeRestrictions = {};

    const promises = Object.keys(data).map(async (key) => {
        const context = new AccessContext({
            registry: Model.app.registry,
            accessToken: accessToken,
            model: Model,
            property: `attribute:${key}`,
            method: ACL.WRITE,
            modelId: currentInstance.id,
        });

        const accessRequest = await ACL.checkAccessForContext(context);

        if (!accessRequest.isAllowed()) {
            attributeRestrictions[key] = ACTION_RESTRICT;
        }
    });

    await Promise.all(promises);

    if (!Object.keys(attributeRestrictions)) {
        debug('no attribute restrictions, aborting');
        return;
    }

    debug('attribute restrictions: %O', attributeRestrictions);

    const sanitizedData = {};

    Object.keys(data).forEach((key) => {
        const action = attributeRestrictions[key];

        if (action) {
            debug('applying action %o to %o', action, key);
        }

        switch (action) {
            case ACTION_RESTRICT: {
                if (currentInstance[key] !== data[key]) {
                    debug('unauthorized access, aborting');
                    const error = new Error(`Unauthorized write to attribute '${key}'`);
                    error.statusCode = 403;
                    throw error;
                }
                break;
            }

            default:
                sanitizedData[key] = data[key];
        }
    });

    debug('data after sanitizing: %O', sanitizedData);

    ctx.data = sanitizedData;
}

module.exports = async (Model) => {
    debug('Registering AttributeAcl mixin for %s', Model.modelName)

    Model.on('attached', () => {
        Model.observe('before save', (ctx, next) => applyAttributeAcls(Model, ctx, next));
    });
}
