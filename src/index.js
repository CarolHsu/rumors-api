import Koa from 'koa';
import Router from 'koa-router';
import config from 'config';
import path from 'path';
import pug from 'pug';
import { printSchema } from 'graphql/utilities';
import { graphqlKoa, graphiqlKoa } from 'graphql-server-koa';
import rollbar from 'rollbar';
import koaStatic from 'koa-static';
import koaBody from 'koa-bodyparser';
import session from 'koa-session2';
import passport from 'koa-passport';
import allowCORS from './allowCORS';
import schema from './graphql/schema';
import DataLoaders from './graphql/dataLoaders';

import { loginRouter, authRouter } from './auth';

const app = new Koa();
const router = Router();

rollbar.init(config.get('ROLLBAR_TOKEN'), {
  environment: config.get('ROLLBAR_ENV'),
});

rollbar.handleUncaughtExceptionsAndRejections();


app.use(async (ctx, next) => {
  try {
    await next();
  } catch (err) {
    rollbar.handleError(err, ctx.request);
    throw err;
  }
});

app.use(koaBody({
  formLimit: '1mb',
  jsonLimit: '10mb',
  textLimit: '10mb',
}));

app.keys = config.get('COOKIE_SECRETS');

app.use(session({
  signed: true,
  maxAge: config.get('COOKIE_MAXAGE'),
}));
app.use(passport.initialize());
app.use(passport.session());

router.use('/login', loginRouter.routes(), loginRouter.allowedMethods());
router.use('/callback', authRouter.routes(), authRouter.allowedMethods());

router.options('/logout', allowCORS());
router.post('/logout', allowCORS(), (ctx) => {
  ctx.logout();
  ctx.body = { success: true };
});

router.options('/graphql', allowCORS());
router.post('/graphql', allowCORS(), graphqlKoa(ctx => ({
  schema,
  context: {
    loaders: new DataLoaders(), // new loaders per request
    user: ctx.state.user,
  },
})));

router.get('/graphql', graphiqlKoa({ endpointURL: '/graphql' }));

const indexFn = pug.compileFile(path.join(__dirname, 'jade/index.jade'));
const schemaStr = printSchema(schema);
router.get('/', (ctx) => {
  ctx.body = indexFn({ schemaStr });
});

app.use(koaStatic(path.join(__dirname, '../static/')));
app.use(router.routes(), router.allowedMethods());

app.listen(config.get('PORT'), () => {
  console.log('Listening port', config.get('PORT')); // eslint-disable-line no-console
});
