const fs = require('fs');
const nativeCSS = require('native-css');
const R = require('ramda');

const moduleWhitelist = require('./whitelist');

// concatMediaQueries :: String -> { k: v } -> { k: v } -> *
function concatMediaQueries (key, left, right) {
  return R.merge(left, right);
};

// toJS :: CSS -> { k: v }
const toJS = R.reduce((acc, [k, v]) => {
  return R.mergeWithKey(concatMediaQueries, acc, nativeCSS.convert(v));
}, {});

const queries = {
  '@media (--breakpoint-not-small)': '@media screen and (min-width: 30em)',
  '@media (--breakpoint-medium)': '@media screen and (min-width: 30em) and (max-width: 60em)',
  '@media (--breakpoint-large)': '@media screen and (min-width: 60em)'
};

const queryKeys = R.keys(queries);

// mergeMediaQueries :: a -> a
const mergeMediaQueries = styles => {
  const noQueries = R.omit(queryKeys, styles);

  const flipMediaQuery = key => {
    const rules = styles[key];

    return R.reduce((acc, selector) => {
      const newBp = queries[key];
      return R.assocPath([selector, newBp], rules[selector], acc);
    }, {}, R.keys(rules));
  };

  const flippedQueries = R.reduce((acc, key) => {
    return R.merge(acc, flipMediaQuery(key));
  }, {}, queryKeys);

  return R.merge(noQueries, flippedQueries);
};

// addExports :: String -> String
function addExports(json) { return `module.exports = ${json}` };

// toJSON :: { k: v } -> JSON
const toJSON = R.compose(
  addExports,
  js => JSON.stringify(js, null, 2)
)

// writeFile :: JSON -> Promise [fs]
function writeFile(file) {
  return new Promise((res, rej) => {
    fs.writeFile('index.js', file, (err, result) => {
      if (err) { rej(err) }
      res(result);
    })
  })
};

// constructFile :: { k: v } -> String -> { k: v }
function constructFile (modules, module) {
  var moduleLocation = getModuleCssLocation(module)
  var moduleName = getModuleKey(module)
  // const key = '_' + moduleName + '.css';
  return R.assoc(moduleName, moduleLocation, modules);
};

// isTachyonsModule :: String -> Boolean
function isTachyonsModule (module) {
  return module.indexOf('tachyons') !== -1
};

// isNormalizeModule :: String -> Boolean
function isNormalizeModule (module) {
  return module === 'normalize.css'
};

// getModuleCssLocation :: String -> String
function getModuleCssLocation (module) {
  try {
    if (isTachyonsModule(module)) {
      return 'node_modules/' + module + '/' + require('./node_modules/' + module + '/package.json').style
    } else if (isNormalizeModule(module)) {
      return 'node_modules/' + module + '/' + module
    } else {
      console.error('Unknown module: ' + module);
    }
  } catch (e) {
    console.log(e);
  }
};

// getModuleKey :: String -> String
function getModuleKey (module) {
  return R.replace(/(tachyons-|\.css)/ig, '', module);
};

// hoverRegex :: RegExp
const hoverRegex = /_hover$/

// isHoverStyle :: String -> Boolean
const isHoverStyle = R.test(hoverRegex);

const stripHoverSuffix = R.replace(hoverRegex, '');

const extractHoverStyles = styles => {
  return R.reduce((acc, key) => {
    if (isHoverStyle(key)) {
      const rootKey = stripHoverSuffix(key);

      if (styles[rootKey]) {
        return R.compose(
          R.dissoc(key),
          R.assoc(':hover', styles[key])
        )(acc);
      };

      return R.compose(
        R.dissoc(key),
        R.assoc(rootKey, { ':hover': styles[key] })
      )(acc);
    };
    return acc;
  }, styles, R.keys(styles));
};

Promise.all(moduleWhitelist.map(name => name))
  .then(R.reduce(constructFile, {}))
  .then(R.toPairs)
  .then(toJS)
  .then(mergeMediaQueries)
  .then(extractHoverStyles)
  .then(R.omit(['root']))
  .then(toJSON)
  .then(writeFile)
  .catch(e => console.log(e))