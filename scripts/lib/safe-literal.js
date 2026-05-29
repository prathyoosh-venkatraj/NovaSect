/**
 * safe-literal.js — parse a JavaScript *data literal* into a plain JS value
 * WITHOUT executing any code (no eval / new Function / vm).
 *
 * Build/maintenance scripts extract literals (COMPANIES, RATING_BANDS,
 * skeletonReports, companyData) out of first-party source files. Those used
 * eval()/new Function(), which execute arbitrary code. This parser walks the
 * acorn AST and only evaluates *static literal* nodes — arrays, objects,
 * strings, numbers, booleans, null, and unary +/- on numbers. Anything else
 * (function calls, identifiers, member access, template expressions, spreads)
 * throws, so it can never run code.
 *
 * Behaviour is a strict superset-compatible replacement for the previous
 * eval() on the same inputs: it accepts the same object/array literals
 * (unquoted keys, trailing commas, comments — all handled by the parser) and
 * returns the identical value.
 */
const { parseExpressionAt } = require('acorn');

function evalNode(node) {
    switch (node.type) {
        case 'Literal':
            // string | number | boolean | null | bigint | regex.
            if (node.regex) throw new Error('safe-literal: regex literals not allowed');
            return node.value;

        case 'ArrayExpression':
            return node.elements.map(el => {
                if (el === null) return undefined;            // elision, e.g. [1,,3]
                if (el.type === 'SpreadElement') throw new Error('safe-literal: spread not allowed');
                return evalNode(el);
            });

        case 'ObjectExpression': {
            const obj = {};
            for (const prop of node.properties) {
                if (prop.type !== 'Property') throw new Error('safe-literal: only plain properties allowed');
                if (prop.computed) throw new Error('safe-literal: computed keys not allowed');
                let key;
                if (prop.key.type === 'Identifier') key = prop.key.name;
                else if (prop.key.type === 'Literal') key = String(prop.key.value);
                else throw new Error('safe-literal: unsupported key type ' + prop.key.type);
                obj[key] = evalNode(prop.value);
            }
            return obj;
        }

        case 'UnaryExpression': {
            const arg = evalNode(node.argument);
            if (typeof arg !== 'number' && typeof arg !== 'bigint') {
                throw new Error('safe-literal: unary ' + node.operator + ' only on numbers');
            }
            if (node.operator === '-') return -arg;
            if (node.operator === '+') return +arg;
            throw new Error('safe-literal: unsupported unary operator ' + node.operator);
        }

        default:
            throw new Error('safe-literal: disallowed node type ' + node.type);
    }
}

/**
 * @param {string} code  source text of a single JS expression literal
 * @returns the plain JS value
 */
function parseLiteral(code) {
    const node = parseExpressionAt(code.trim(), 0, { ecmaVersion: 'latest' });
    return evalNode(node);
}

module.exports = { parseLiteral };
