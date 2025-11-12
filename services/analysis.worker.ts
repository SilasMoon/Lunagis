// services/analysis.worker.ts

import type { DataSet, DataSlice, Layer, DataLayer, AnalysisLayer, DteCommsLayer, LpfCommsLayer, TimeRange } from '../types';

// --- Expression Evaluator Logic (moved from expressionEvaluator.ts) ---

interface Token {
  type: 'LITERAL' | 'VARIABLE' | 'OPERATOR' | 'LPAREN' | 'RPAREN';
  value: string | number;
}

const OPERATORS: { [key: string]: { precedence: number; associativity: 'Left' | 'Right' } } = {
  '>': { precedence: 2, associativity: 'Left' },
  '>=': { precedence: 2, associativity: 'Left' },
  '<': { precedence: 2, associativity: 'Left' },
  '<=': { precedence: 2, associativity: 'Left' },
  '==': { precedence: 2, associativity: 'Left' },
  'AND': { precedence: 1, associativity: 'Left' },
  'OR': { precedence: 1, associativity: 'Left' },
  'NOT': { precedence: 3, associativity: 'Right' },
};

function tokenize(expression: string): Token[] {
  const tokens: Token[] = [];
  const regex = /\s*(>=|<=|==|>|<|\(|\)|[a-zA-Z_][a-zA-Z0-9_]*|\d+(\.\d+)?|\S)\s*/g;
  let match;

  while ((match = regex.exec(expression)) !== null) {
    const tokenStr = match[1];
    const upperToken = tokenStr.toUpperCase();

    if (!isNaN(Number(tokenStr))) {
      tokens.push({ type: 'LITERAL', value: Number(tokenStr) });
    } else if (upperToken in OPERATORS) {
      tokens.push({ type: 'OPERATOR', value: upperToken });
    } else if (tokenStr === '(') {
      tokens.push({ type: 'LPAREN', value: tokenStr });
    } else if (tokenStr === ')') {
      tokens.push({ type: 'RPAREN', value: tokenStr });
    } else if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tokenStr)) {
      tokens.push({ type: 'VARIABLE', value: tokenStr });
    } else {
      throw new Error(`Invalid token: ${tokenStr}`);
    }
  }
  return tokens;
}

function shuntingYard(tokens: Token[]): Token[] {
  const outputQueue: Token[] = [];
  const operatorStack: Token[] = [];

  for (const token of tokens) {
    if (token.type === 'LITERAL' || token.type === 'VARIABLE') {
      outputQueue.push(token);
    } else if (token.type === 'OPERATOR') {
      const op1 = token.value as string;
      while (
        operatorStack.length > 0 &&
        operatorStack[operatorStack.length - 1].type === 'OPERATOR'
      ) {
        const op2 = operatorStack[operatorStack.length - 1].value as string;
        if (
          (OPERATORS[op1].associativity === 'Left' && OPERATORS[op1].precedence <= OPERATORS[op2].precedence) ||
          (OPERATORS[op1].associativity === 'Right' && OPERATORS[op1].precedence < OPERATORS[op2].precedence)
        ) {
          outputQueue.push(operatorStack.pop()!);
        } else {
          break;
        }
      }
      operatorStack.push(token);
    } else if (token.type === 'LPAREN') {
      operatorStack.push(token);
    } else if (token.type === 'RPAREN') {
      while (
        operatorStack.length > 0 &&
        operatorStack[operatorStack.length - 1].type !== 'LPAREN'
      ) {
        outputQueue.push(operatorStack.pop()!);
      }
      if (operatorStack.length === 0) {
        throw new Error('Mismatched parentheses');
      }
      operatorStack.pop(); // Pop the LPAREN
    }
  }

  while (operatorStack.length > 0) {
    const op = operatorStack.pop()!;
    if (op.type === 'LPAREN') {
      throw new Error('Mismatched parentheses');
    }
    outputQueue.push(op);
  }

  return outputQueue;
}

function evaluateRPN(rpnQueue: Token[], context: { [key: string]: number }): number {
    const stack: (number | boolean)[] = [];

    for (const token of rpnQueue) {
        if (token.type === 'LITERAL') {
            stack.push(token.value as number);
        } else if (token.type === 'VARIABLE') {
            const value = context[token.value as string];
            if (value === undefined) {
                throw new Error(`Undefined variable: ${token.value}`);
            }
            stack.push(value);
        } else if (token.type === 'OPERATOR') {
            if (token.value === 'NOT') {
                if (stack.length < 1) throw new Error('Invalid expression for NOT operator');
                const operand = stack.pop();
                stack.push(!operand ? 1 : 0);
                continue;
            }

            if (stack.length < 2) throw new Error(`Invalid expression for operator ${token.value}`);
            const b = stack.pop()!;
            const a = stack.pop()!;

            switch (token.value) {
                case '>': stack.push(a > b ? 1 : 0); break;
                case '>=': stack.push(a >= b ? 1 : 0); break;
                case '<': stack.push(a < b ? 1 : 0); break;
                case '<=': stack.push(a <= b ? 1 : 0); break;
                case '==': stack.push(a == b ? 1 : 0); break;
                case 'AND': stack.push(a && b ? 1 : 0); break;
                case 'OR': stack.push(a || b ? 1 : 0); break;
                default: throw new Error(`Unknown operator: ${token.value}`);
            }
        }
    }

    if (stack.length !== 1) {
        throw new Error('The final expression stack is invalid');
    }
    
    return stack[0] as number;
}

function evaluateExpression(expression: string, context: { [key: string]: number }): number {
    if (!expression.trim()) return 0;
    try {
        const tokens = tokenize(expression);
        const rpn = shuntingYard(tokens);
        return evaluateRPN(rpn, context);
    } catch (e) {
        if (e instanceof Error) {
            throw new Error(`Expression evaluation failed: ${e.message}`);
        }
        throw new Error("An unknown error occurred during expression evaluation.");
    }
}

function getExpressionVariables(expression: string): string[] {
    try {
        const tokens = tokenize(expression);
        const variables = new Set<string>();
        for (const token of tokens) {
            if (token.type === 'VARIABLE') {
                variables.add(token.value as string);
            }
        }
        return Array.from(variables);
    } catch (e) {
        return [];
    }
}

// --- Analysis Functions ---

function sanitizeLayerNameForExpression(name: string): string {
    return name.replace(/[^a-zA-Z0-9_]/g, '_');
};

async function calculateExpressionLayer(expression: string, serializableLayers: any[], datasets: DataSet[]): Promise<{ dataset: DataSet; range: { min: number; max: number }; dimensions: { time: number; height: number; width: number; } }> {
    // Rehydrate layers with their datasets
    let datasetIndex = 0;
    const availableLayers: Layer[] = serializableLayers.map(l => {
        if (l.hasDataset) {
            return { ...l, dataset: datasets[datasetIndex++] };
        }
        return l;
    });
    
    const variables = getExpressionVariables(expression);
    const sourceLayers: (DataLayer | AnalysisLayer | DteCommsLayer | LpfCommsLayer)[] = [];

    for (const v of variables) {
        const layer = availableLayers.find(l => sanitizeLayerNameForExpression(l.name) === v);
        if (!layer || !('dataset' in layer)) {
            throw new Error(`Variable "${v}" does not correspond to a valid data layer.`);
        }
        sourceLayers.push(layer as any);
    }
    
    if (sourceLayers.length === 0 && variables.length > 0) throw new Error(`No layers found for variables: ${variables.join(', ')}`);

    if (sourceLayers.length === 0 && variables.length === 0) {
        const firstDataLayer = availableLayers.find(l => 'dataset' in l) as DataLayer | undefined;
        if (!firstDataLayer) throw new Error("Cannot evaluate a constant expression without a data layer for dimensions.");
        const { time, height, width } = firstDataLayer.dimensions;
        const result = evaluateExpression(expression, {});
        const resultDataset: DataSet = Array.from({ length: time }, () => Array.from({ length: height }, () => new Array(width).fill(result)));
        return { dataset: resultDataset, range: { min: 0, max: 1 }, dimensions: { time, height, width } };
    }

    const { time, height, width } = sourceLayers[0].dimensions;
    if (!sourceLayers.every(l => l.dimensions.time === time && l.dimensions.height === height && l.dimensions.width === width)) {
        throw new Error("All layers in an expression must have the same dimensions.");
    }

    const resultDataset: DataSet = Array.from({ length: time }, () => Array.from({ length: height }, () => new Array(width).fill(0)));

    for (let t = 0; t < time; t++) {
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const context: { [key: string]: number } = {};
                for (const layer of sourceLayers) {
                    const varName = sanitizeLayerNameForExpression(layer.name);
                    context[varName] = layer.dataset[t][y][x];
                }
                resultDataset[t][y][x] = evaluateExpression(expression, context);
            }
        }
    }

    return { dataset: resultDataset, range: { min: 0, max: 1 }, dimensions: { time, height, width } };
};

async function calculateNightfallDataset(sourceLayer: DataLayer): Promise<{dataset: DataSet, range: {min: number, max: number}, maxDuration: number}> {
    const { dataset, dimensions } = sourceLayer;
    const { time, height, width } = dimensions;

    const resultDataset: DataSet = Array.from({ length: time }, () => Array.from({ length: height }, () => new Array(width).fill(0)));
    let maxDuration = 0;
    let minDuration = 0;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const pixelTimeSeries = dataset.map(slice => slice[y][x]);
            const nightPeriods: { start: number; end: number; duration: number }[] = [];
            let inNight = false;
            let nightStart = -1;

            for (let t = 0; t < time; t++) {
                const isCurrentlyNight = pixelTimeSeries[t] === 0;
                if (isCurrentlyNight && !inNight) {
                    inNight = true;
                    nightStart = t;
                } else if (!isCurrentlyNight && inNight) {
                    inNight = false;
                    nightPeriods.push({ start: nightStart, end: t, duration: t - nightStart });
                }
            }
            if (inNight) {
                nightPeriods.push({ start: nightStart, end: time, duration: time - nightStart });
            }
            
            let nextNightIndex = 0;
            let currentNightIndex = 0;
            for (let t = 0; t < time; t++) {
                if (pixelTimeSeries[t] === 1) { // DAY
                    // Find the *next* night period. This logic is already efficient.
                    while (nextNightIndex < nightPeriods.length && nightPeriods[nextNightIndex].start <= t) {
                        nextNightIndex++;
                    }
                    if (nextNightIndex < nightPeriods.length) {
                        const nextNight = nightPeriods[nextNightIndex];
                        resultDataset[t][y][x] = nextNight.duration;
                        if (nextNight.duration > maxDuration) maxDuration = nextNight.duration;
                    } else {
                        resultDataset[t][y][x] = 0;
                    }
                } else { // NIGHT
                    // Find the *current* night period efficiently.
                    // Advance the index past any night periods that have already ended.
                    while (currentNightIndex < nightPeriods.length && nightPeriods[currentNightIndex].end <= t) {
                        currentNightIndex++;
                    }

                    let currentNight = null;
                    if (currentNightIndex < nightPeriods.length) {
                        const candidate = nightPeriods[currentNightIndex];
                        // Check if the current time t falls within this candidate period.
                        if (t >= candidate.start) {
                            currentNight = candidate;
                        }
                    }

                    if (currentNight) {
                        const forecastValue = -currentNight.duration;
                        resultDataset[t][y][x] = forecastValue;
                        if (forecastValue < minDuration) minDuration = forecastValue;
                    } else {
                        // This case should not be reached with correct logic but is a safe fallback.
                        resultDataset[t][y][x] = -1;
                    }
                }
            }
        }
    }
    return { dataset: resultDataset, range: { min: minDuration, max: maxDuration }, maxDuration };
};


// --- Worker Message Handler ---

self.onmessage = async (e) => {
    const { type, requestId, payload } = e.data;
    try {
        let result;
        switch (type) {
            case 'NIGHTFALL':
                result = await calculateNightfallDataset(payload.sourceLayer);
                break;
            case 'EXPRESSION':
                result = await calculateExpressionLayer(payload.expression, payload.layers, payload.datasets);
                break;
            default:
                throw new Error(`Unknown task type: ${type}`);
        }
        self.postMessage({ requestId, result });
    } catch (error) {
        self.postMessage({ requestId, error: error instanceof Error ? error.message : String(error) });
    }
};