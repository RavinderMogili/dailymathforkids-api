/**
 * Server-side practice question generation — the authoritative source of
 * truth for practice sessions (see api/practice-session-start.js).
 *
 * PROVENANCE: everything from here down to "END PORTED SECTION" is copied
 * verbatim from scripts/practice-engine.js in the frontend repo
 * (dailymathforkids), lines 1-983 as of the port (confirmed browser-API-free
 * — no window/document/fetch/localStorage — before porting, which is what
 * makes running it here, in Node, produce the exact same questions the
 * client used to generate itself).
 *
 * KEEPING IN SYNC: this is a deliberate, acknowledged duplication across two
 * repos, not a shared package (see tools/word-problems/README.md in the
 * frontend repo, "Server-side generator port," for the tradeoff). There is
 * NO automated cross-repo CI check for drift — each repo's CI only sees its
 * own checkout. `tools/verify-generator-sync.js` in this repo is a manual
 * script (takes both repo paths as arguments) a developer should run after
 * editing either copy, before relying on them matching. If the two files
 * silently drift, the practical consequence is that the questions a student
 * sees rendered client-side during offline/local-fallback practice (no
 * session, no points — see practice-session-start.js) could describe a
 * *different* question than what the session-verified server-side flow
 * would have generated for the same inputs; it does not create a scoring
 * bug on its own, since the server's copy is always what's actually scored.
 */
// ── Practice Mode Question Generator ─────────────────────────────────────
// Generates math questions algorithmically based on grade, topic, difficulty.

const TOPICS_BY_GRADE = {
  1: ['Addition & Subtraction', 'Place Value', 'Counting', 'Comparing Numbers', 'Patterns', 'Telling Time', 'Measurement', 'Geometry', 'Word Problems'],
  2: ['Addition & Subtraction', 'Place Value', 'Comparing Numbers', 'Patterns', 'Telling Time', 'Measurement', 'Money', 'Geometry', 'Word Problems'],
  3: ['Multiplication & Division', 'Fractions', 'Place Value', 'Elapsed Time', 'Perimeter', 'Measurement', 'Geometry', 'Word Problems'],
  4: ['Multi-digit Arithmetic', 'Fractions', 'Decimals', 'Factors & Multiples', 'Angles', 'Measurement', 'Geometry', 'Word Problems'],
  5: ['Decimals', 'Fractions', 'Percentages', 'Order of Operations', 'Volume', 'Metric Conversions', 'Coordinate Plane', 'Word Problems'],
  6: ['Ratios & Proportions', 'Percent & Discount', 'Integers', 'Expressions & Equations', 'Area & Surface Area', 'Statistics', 'Word Problems'],
  7: ['Proportional Relationships', 'Operations with Rationals', 'Expressions & Equations', 'Geometry', 'Probability & Statistics', 'Word Problems'],
  8: ['Linear Equations', 'Functions', 'Exponents & Roots', 'Pythagorean Theorem', 'Transformations', 'Word Problems'],
  9: ['Linear Functions', 'Quadratic Equations', 'Polynomials', 'Inequalities', 'Data Analysis', 'Word Problems'],
  10: ['Quadratics', 'Trigonometry', 'Circle Geometry', 'Coordinate Geometry', 'Systems of Equations', 'Word Problems'],
  11: ['Functions', 'Exponential & Logarithmic', 'Sequences & Series', 'Trigonometric Functions', 'Financial Math', 'Word Problems'],
  12: ['Limits & Derivatives', 'Advanced Functions', 'Probability & Statistics', 'Vectors', 'Proof & Logic', 'Word Problems'],
};

function getTopicsForGrade(grade) {
  return TOPICS_BY_GRADE[grade] || TOPICS_BY_GRADE[3];
}

// ── Helpers ──────────────────────────────────────────────────────────────
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function shuffle(arr) { for (let i = arr.length - 1; i > 0; i--) { const j = randInt(0, i); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; }
function pick(arr) { return arr[randInt(0, arr.length - 1)]; }
function round2(n) { return Math.round(n * 100) / 100; }
function gcd(a, b) { return b === 0 ? a : gcd(b, a % b); }

function makeChoices(correct, count = 4, gen) {
  const choices = new Set([String(correct)]);
  let tries = 0;
  while (choices.size < count && tries < 50) {
    const wrong = gen();
    if (String(wrong) !== String(correct)) choices.add(String(wrong));
    tries++;
  }
  while (choices.size < count) choices.add(String(correct + choices.size));
  return shuffle([...choices]);
}

// ── Grade 1-2: Addition & Subtraction ────────────────────────────────────
function genAddSub(grade, difficulty) {
  const ranges = {
    easy:   grade <= 2 ? [1, 10] : [1, 20],
    medium: grade <= 2 ? [1, 20] : [10, 50],
    hard:   grade <= 2 ? [5, 50] : [20, 100],
  };
  const [lo, hi] = ranges[difficulty];
  const isAdd = Math.random() > 0.4;
  if (isAdd) {
    const a = randInt(lo, hi), b = randInt(lo, hi);
    const ans = a + b;
    return { question: `${a} + ${b} = ?`, answer: String(ans), choices: makeChoices(ans, 4, () => ans + randInt(-5, 5)) };
  } else {
    const b = randInt(lo, Math.floor(hi / 2)), a = b + randInt(lo, hi);
    const ans = a - b;
    return { question: `${a} − ${b} = ?`, answer: String(ans), choices: makeChoices(ans, 4, () => ans + randInt(-5, 5)) };
  }
}

// ── Grade 1-2: Place Value ───────────────────────────────────────────────
function genPlaceValue(grade, difficulty) {
  if (difficulty === 'easy') {
    const n = randInt(10, 99);
    const tens = Math.floor(n / 10), ones = n % 10;
    const askTens = Math.random() > 0.5;
    const ans = askTens ? tens : ones;
    return { question: `What is the ${askTens ? 'tens' : 'ones'} digit of ${n}?`, answer: String(ans), choices: makeChoices(ans, 4, () => randInt(0, 9)) };
  } else if (difficulty === 'medium') {
    const n = grade >= 2 ? randInt(100, 999) : randInt(10, 99);
    const digits = grade >= 2 ? ['hundreds', 'tens', 'ones'] : ['tens', 'ones'];
    const which = pick(digits);
    const ans = which === 'hundreds' ? Math.floor(n / 100) : which === 'tens' ? Math.floor((n % 100) / 10) : n % 10;
    return { question: `What is the ${which} digit of ${n}?`, answer: String(ans), choices: makeChoices(ans, 4, () => randInt(0, 9)) };
  } else {
    const a = randInt(100, 999), b = randInt(100, 999);
    const ans = a > b ? '>' : a < b ? '<' : '=';
    return { question: `Compare: ${a} ___ ${b}`, answer: ans, choices: ['>', '<', '=', `${a > b ? '<' : '>'}`] };
  }
}

// ── Grade 1-2: Counting ─────────────────────────────────────────────────
function genCounting(grade, difficulty) {
  const skipBy = difficulty === 'easy' ? pick([2, 5, 10]) : difficulty === 'medium' ? pick([3, 4, 5]) : pick([6, 7, 8, 9]);
  const start = randInt(0, 20) * skipBy;
  const steps = randInt(3, 5);
  const seq = [];
  for (let i = 0; i < steps; i++) seq.push(start + i * skipBy);
  const ans = start + steps * skipBy;
  return { question: `What comes next? ${seq.join(', ')}, ?`, answer: String(ans), choices: makeChoices(ans, 4, () => ans + randInt(-2, 2) * skipBy) };
}

// ── Grade 1-2: Measurement ──────────────────────────────────────────────
function genMeasurement12(grade, difficulty) {
  if (difficulty === 'easy') {
    const hr = randInt(1, 12);
    return { question: `A clock shows ${hr}:00. What hour is it?`, answer: String(hr), choices: makeChoices(hr, 4, () => randInt(1, 12)) };
  } else {
    const items = ['pencil', 'book', 'desk', 'eraser', 'ruler'];
    const a = pick(items), aLen = randInt(3, 30);
    let b; do { b = pick(items); } while (b === a);
    const bLen = randInt(3, 30);
    const ans = aLen > bLen ? a : b;
    return { question: `A ${a} is ${aLen} cm. A ${b} is ${bLen} cm. Which is longer?`, answer: ans, choices: [a, b, 'Same', 'Not sure'] };
  }
}

// ── Grade 1-2: Geometry ─────────────────────────────────────────────────
function genGeometry12(grade, difficulty) {
  const shapes = [
    { name: 'triangle', sides: 3 },
    { name: 'square', sides: 4 },
    { name: 'rectangle', sides: 4 },
    { name: 'pentagon', sides: 5 },
    { name: 'hexagon', sides: 6 },
    { name: 'circle', sides: 0 },
  ];
  const s = pick(shapes.filter(x => x.sides > 0));
  if (difficulty === 'easy') {
    return { question: `How many sides does a ${s.name} have?`, answer: String(s.sides), choices: makeChoices(s.sides, 4, () => randInt(2, 8)) };
  } else {
    return { question: `Which shape has ${s.sides} sides?`, answer: s.name, choices: shuffle(shapes.filter(x => x.sides > 0).slice(0, 4).map(x => x.name)) };
  }
}

// ── Grade 1-2: Comparing Numbers ───────────────────────────────────────
function genComparing(grade, difficulty) {
  if (difficulty === 'easy') {
    const a = randInt(1, 20), b = randInt(1, 20);
    const ans = a > b ? '>' : a < b ? '<' : '=';
    return { question: `Compare: ${a} ___ ${b}`, answer: ans, choices: shuffle(['>', '<', '=', a > b ? '<' : '>']) };
  } else if (difficulty === 'medium') {
    const a = randInt(10, 100), b = randInt(10, 100);
    const ans = a > b ? '>' : a < b ? '<' : '=';
    return { question: `Compare: ${a} ___ ${b}`, answer: ans, choices: shuffle(['>', '<', '=', a > b ? '<' : '>']) };
  } else {
    const nums = [randInt(10, 99), randInt(10, 99), randInt(10, 99)];
    const sorted = [...nums].sort((a, b) => a - b);
    const askType = pick(['smallest', 'largest']);
    const ans = askType === 'smallest' ? sorted[0] : sorted[sorted.length - 1];
    return { question: `Which is the ${askType}? ${nums.join(', ')}`, answer: String(ans), choices: shuffle(nums.map(String).concat([String(randInt(10, 99))])).slice(0, 4) };
  }
}

// ── Grade 1-2: Patterns ────────────────────────────────────────────────
function genPatterns(grade, difficulty) {
  if (difficulty === 'easy') {
    const step = pick([1, 2, 5, 10]);
    const start = randInt(0, 10) * step;
    const seq = [start, start + step, start + 2 * step, start + 3 * step];
    const ans = start + 4 * step;
    return { question: `What comes next? ${seq.join(', ')}, ?`, answer: String(ans), choices: makeChoices(ans, 4, () => ans + randInt(-2, 2) * step) };
  } else if (difficulty === 'medium') {
    const shapes = ['circle', 'square', 'triangle', 'star', 'diamond', 'heart'];
    const a = pick(shapes), b = pick(shapes.filter(s => s !== a));
    const pattern = [a, b, a, b, a, b];
    const ans = a;
    return { question: `What comes next? ${pattern.join(' ')} ?`, answer: ans, choices: shuffle([a, b, pick(shapes.filter(s => s !== a && s !== b)), pick(shapes.filter(s => s !== a))]) };
  } else {
    const step = pick([3, 4, 6, 7]);
    const start = randInt(1, 5) * step;
    const seq = [start, start + step, start + 2 * step, start + 3 * step, start + 4 * step];
    const ans = start + 5 * step;
    return { question: `Find the pattern and next number: ${seq.join(', ')}, ?`, answer: String(ans), choices: makeChoices(ans, 4, () => ans + randInt(-2, 3) * step) };
  }
}

// ── Grade 1-2: Telling Time ────────────────────────────────────────────
function genTellingTime(grade, difficulty) {
  if (difficulty === 'easy') {
    const hr = randInt(1, 12);
    return { question: `A clock shows ${hr}:00. What time is it?`, answer: `${hr}:00`, choices: makeChoices(`${hr}:00`, 4, () => `${randInt(1, 12)}:00`) };
  } else if (difficulty === 'medium') {
    const hr = randInt(1, 12);
    const min = pick([0, 15, 30, 45]);
    const display = `${hr}:${String(min).padStart(2, '0')}`;
    return { question: `A clock shows ${display}. What time is it?`, answer: display, choices: makeChoices(display, 4, () => `${randInt(1, 12)}:${pick(['00', '15', '30', '45'])}`) };
  } else {
    const hr = randInt(1, 12);
    const min = pick([5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]);
    const display = `${hr}:${String(min).padStart(2, '0')}`;
    const askType = pick(['read', 'minutes']);
    if (askType === 'read') {
      return { question: `What time does the clock show? ${display}`, answer: display, choices: makeChoices(display, 4, () => `${randInt(1, 12)}:${String(pick([5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55])).padStart(2, '0')}`) };
    } else {
      return { question: `How many minutes past ${hr} o'clock is ${display}?`, answer: String(min), choices: makeChoices(min, 4, () => pick([5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55])) };
    }
  }
}

// ── Grade 3: Elapsed Time ──────────────────────────────────────────────
function genElapsedTime(grade, difficulty) {
  if (difficulty === 'easy') {
    const startHr = randInt(1, 10);
    const elapsed = pick([1, 2, 3]);
    const endHr = startHr + elapsed;
    return { question: `School starts at ${startHr}:00 and ends at ${endHr}:00. How many hours?`, answer: String(elapsed), choices: makeChoices(elapsed, 4, () => randInt(1, 6)) };
  } else if (difficulty === 'medium') {
    const startHr = randInt(1, 10);
    const startMin = pick([0, 15, 30]);
    const addMin = pick([15, 30, 45, 60]);
    let endMin = startMin + addMin;
    let endHr = startHr + Math.floor(endMin / 60);
    endMin = endMin % 60;
    const start = `${startHr}:${String(startMin).padStart(2, '0')}`;
    const end = `${endHr}:${String(endMin).padStart(2, '0')}`;
    return { question: `Start: ${start}. End: ${end}. How many minutes passed?`, answer: String(addMin), choices: makeChoices(addMin, 4, () => pick([15, 30, 45, 60, 90])) };
  } else {
    const startHr = randInt(8, 11);
    const startMin = pick([0, 10, 15, 20, 30]);
    const addHr = randInt(1, 3);
    const addMin = pick([10, 15, 20, 25, 30, 45]);
    let endMin = startMin + addMin;
    let endHr = startHr + addHr + Math.floor(endMin / 60);
    endMin = endMin % 60;
    const end = `${endHr}:${String(endMin).padStart(2, '0')}`;
    const totalMin = addHr * 60 + addMin;
    return { question: `From ${startHr}:${String(startMin).padStart(2, '0')} to ${end}. How many minutes total?`, answer: String(totalMin), choices: makeChoices(totalMin, 4, () => totalMin + randInt(-20, 20)) };
  }
}

// ── Grade 3+: Perimeter ────────────────────────────────────────────────
function genPerimeter(grade, difficulty) {
  if (difficulty === 'easy') {
    const side = randInt(2, 12);
    const ans = side * 4;
    return { question: `A square has a side of ${side} cm. What is its perimeter?`, answer: String(ans) + ' cm', choices: makeChoices(ans + ' cm', 4, () => (randInt(2, 12) * 4) + ' cm') };
  } else if (difficulty === 'medium') {
    const l = randInt(3, 15), w = randInt(2, 10);
    const ans = 2 * (l + w);
    return { question: `A rectangle is ${l} cm long and ${w} cm wide. What is the perimeter?`, answer: String(ans) + ' cm', choices: makeChoices(ans + ' cm', 4, () => (2 * (randInt(3, 15) + randInt(2, 10))) + ' cm') };
  } else {
    const a = randInt(3, 10), b = randInt(3, 10), c = randInt(3, 10);
    const ans = a + b + c;
    return { question: `A triangle has sides ${a} cm, ${b} cm, and ${c} cm. What is the perimeter?`, answer: String(ans) + ' cm', choices: makeChoices(ans + ' cm', 4, () => (randInt(3, 10) + randInt(3, 10) + randInt(3, 10)) + ' cm') };
  }
}

// ── Grade 4: Factors & Multiples ───────────────────────────────────────
function genFactorsMultiples(grade, difficulty) {
  if (difficulty === 'easy') {
    const n = pick([6, 8, 10, 12, 15, 18, 20, 24]);
    const factor = pick([2, 3, 4, 5, 6]);
    const isFactor = n % factor === 0;
    return { question: `Is ${factor} a factor of ${n}?`, answer: isFactor ? 'Yes' : 'No', choices: ['Yes', 'No', 'Maybe', 'Not sure'] };
  } else if (difficulty === 'medium') {
    const n = pick([3, 4, 5, 6, 7, 8, 9]);
    const mult = randInt(2, 10);
    const ans = n * mult;
    return { question: `What is the ${mult}${mult === 2 ? 'nd' : mult === 3 ? 'rd' : 'th'} multiple of ${n}?`, answer: String(ans), choices: makeChoices(ans, 4, () => n * randInt(2, 10)) };
  } else {
    const a = pick([4, 6, 8, 9, 10, 12]);
    const b = pick([4, 6, 8, 9, 10, 12].filter(x => x !== a));
    const lcm = (a * b) / gcd(a, b);
    return { question: `What is the LCM of ${a} and ${b}?`, answer: String(lcm), choices: makeChoices(lcm, 4, () => pick([a, b]) * randInt(2, 6)) };
  }
}

// ── Grade 4: Angles ────────────────────────────────────────────────────
function genAngles(grade, difficulty) {
  if (difficulty === 'easy') {
    const angle = pick([30, 45, 60, 90, 120, 150, 180]);
    const type = angle < 90 ? 'acute' : angle === 90 ? 'right' : angle < 180 ? 'obtuse' : 'straight';
    return { question: `An angle of ${angle}° is called?`, answer: type, choices: shuffle(['acute', 'right', 'obtuse', 'straight']) };
  } else if (difficulty === 'medium') {
    const angle = randInt(10, 170);
    const complement = 180 - angle;
    return { question: `Two angles on a straight line. One is ${angle}°. What is the other?`, answer: String(complement) + '°', choices: makeChoices(complement + '°', 4, () => randInt(10, 170) + '°') };
  } else {
    const angle = randInt(10, 80);
    const complement = 90 - angle;
    return { question: `Two complementary angles. One is ${angle}°. What is the other?`, answer: String(complement) + '°', choices: makeChoices(complement + '°', 4, () => randInt(10, 80) + '°') };
  }
}

// ── Grade 5: Percentages ───────────────────────────────────────────────
function genPercentages(grade, difficulty) {
  if (difficulty === 'easy') {
    const pct = pick([10, 25, 50]);
    const total = pick([20, 40, 50, 80, 100, 200]);
    const ans = total * pct / 100;
    return { question: `What is ${pct}% of ${total}?`, answer: String(ans), choices: makeChoices(ans, 4, () => total * pick([10, 25, 50]) / 100) };
  } else if (difficulty === 'medium') {
    const pct = pick([5, 10, 15, 20, 25, 30, 40, 50, 75]);
    const total = pick([40, 60, 80, 100, 120, 200]);
    const ans = total * pct / 100;
    return { question: `What is ${pct}% of ${total}?`, answer: String(ans), choices: makeChoices(ans, 4, () => round2(total * randInt(5, 75) / 100)) };
  } else {
    const part = pick([10, 15, 20, 25, 30, 40]);
    const total = pick([50, 80, 100, 200]);
    const ans = round2(part / total * 100);
    return { question: `${part} is what percent of ${total}?`, answer: ans + '%', choices: makeChoices(ans + '%', 4, () => round2(randInt(5, 80)) + '%') };
  }
}

// ── Grade 5: Metric Conversions ────────────────────────────────────────
function genMetricConversions(grade, difficulty) {
  if (difficulty === 'easy') {
    const cm = pick([100, 200, 300, 500, 1000]);
    const ans = cm / 100;
    return { question: `Convert ${cm} cm to meters.`, answer: String(ans) + ' m', choices: makeChoices(ans + ' m', 4, () => (pick([100, 200, 300, 500, 1000]) / 100) + ' m') };
  } else if (difficulty === 'medium') {
    const askType = pick(['kg', 'mm']);
    if (askType === 'kg') {
      const g = pick([500, 1000, 1500, 2000, 2500, 3000]);
      const ans = g / 1000;
      return { question: `Convert ${g} grams to kilograms.`, answer: String(ans) + ' kg', choices: makeChoices(ans + ' kg', 4, () => (pick([500, 1000, 1500, 2000, 2500, 3000]) / 1000) + ' kg') };
    } else {
      const cm = pick([1, 2, 3, 5, 10, 15]);
      const ans = cm * 10;
      return { question: `Convert ${cm} cm to millimeters.`, answer: String(ans) + ' mm', choices: makeChoices(ans + ' mm', 4, () => (pick([1, 2, 3, 5, 10, 15]) * 10) + ' mm') };
    }
  } else {
    const askType = pick(['L', 'km']);
    if (askType === 'L') {
      const ml = pick([250, 500, 750, 1000, 1500, 2000]);
      const ans = ml / 1000;
      return { question: `Convert ${ml} mL to liters.`, answer: String(ans) + ' L', choices: makeChoices(ans + ' L', 4, () => (pick([250, 500, 750, 1000, 1500, 2000]) / 1000) + ' L') };
    } else {
      const m = pick([500, 1000, 1500, 2000, 5000]);
      const ans = m / 1000;
      return { question: `Convert ${m} meters to kilometers.`, answer: String(ans) + ' km', choices: makeChoices(ans + ' km', 4, () => (pick([500, 1000, 1500, 2000, 5000]) / 1000) + ' km') };
    }
  }
}

// ── Grade 6: Percent & Discount ────────────────────────────────────────
function genPercentDiscount(grade, difficulty) {
  if (difficulty === 'easy') {
    const price = pick([10, 20, 30, 40, 50]);
    const pct = pick([10, 20, 25, 50]);
    const discount = price * pct / 100;
    const ans = price - discount;
    return { question: `A $${price} item is ${pct}% off. What is the sale price?`, answer: '$' + ans, choices: makeChoices('$' + ans, 4, () => '$' + (price - price * pick([10, 20, 25, 50]) / 100)) };
  } else if (difficulty === 'medium') {
    const price = pick([25, 40, 60, 80, 100, 120]);
    const pct = pick([5, 10, 15, 20, 25, 30]);
    const discount = price * pct / 100;
    return { question: `A $${price} item has a ${pct}% discount. How much do you save?`, answer: '$' + discount, choices: makeChoices('$' + discount, 4, () => '$' + round2(price * randInt(5, 30) / 100)) };
  } else {
    const original = pick([40, 50, 60, 80, 100]);
    const sale = pick([30, 36, 45, 48, 60, 70, 75]);
    const saved = original - sale;
    const ans = round2(saved / original * 100);
    return { question: `Original price: $${original}. Sale price: $${sale}. What percent off?`, answer: ans + '%', choices: makeChoices(ans + '%', 4, () => round2(randInt(5, 50)) + '%') };
  }
}

// ── Grade 2: Money ──────────────────────────────────────────────────────
function genMoney(grade, difficulty) {
  const coins = difficulty === 'easy' ? [1, 5, 10] : [1, 5, 10, 25];
  const count = difficulty === 'easy' ? randInt(2, 3) : difficulty === 'medium' ? randInt(3, 5) : randInt(4, 6);
  let total = 0;
  const parts = [];
  for (let i = 0; i < count; i++) { const c = pick(coins); total += c; parts.push(c + '¢'); }
  return { question: `How much is ${parts.join(' + ')}?`, answer: total + '¢', choices: makeChoices(total + '¢', 4, () => (total + randInt(-10, 10)) + '¢') };
}

// ── Grade 3+: Multiplication & Division ─────────────────────────────────
function genMulDiv(grade, difficulty) {
  const maxFactor = difficulty === 'easy' ? 5 : difficulty === 'medium' ? 10 : 12;
  const isMul = Math.random() > 0.4;
  if (isMul) {
    const a = randInt(2, maxFactor), b = randInt(2, maxFactor);
    const ans = a * b;
    return { question: `${a} × ${b} = ?`, answer: String(ans), choices: makeChoices(ans, 4, () => randInt(2, maxFactor) * randInt(2, maxFactor)) };
  } else {
    const b = randInt(2, maxFactor), ans = randInt(2, maxFactor);
    const a = b * ans;
    return { question: `${a} ÷ ${b} = ?`, answer: String(ans), choices: makeChoices(ans, 4, () => randInt(1, maxFactor * 2)) };
  }
}

// ── Grade 3+: Fractions ─────────────────────────────────────────────────
function genFractions(grade, difficulty) {
  if (grade <= 4 && difficulty === 'easy') {
    const d = pick([2, 3, 4, 6, 8]);
    const n = randInt(1, d - 1);
    const g = gcd(n, d);
    const sn = n / g, sd = d / g;
    return { question: `Simplify ${n}/${d}`, answer: `${sn}/${sd}`, choices: makeChoices(`${sn}/${sd}`, 4, () => `${randInt(1, d)}/${randInt(2, d + 2)}`) };
  } else if (difficulty === 'medium') {
    const d = pick([2, 4, 5, 8, 10]);
    const n1 = randInt(1, d - 1), n2 = randInt(1, d - 1);
    const sum = n1 + n2;
    const g = gcd(sum, d);
    const ans = sum >= d ? `${Math.floor(sum / d)} ${(sum % d) / g}/${d / g}` : `${sum / g}/${d / g}`;
    return { question: `${n1}/${d} + ${n2}/${d} = ?`, answer: ans.replace(/ 0\/\d+/, ''), choices: makeChoices(ans, 4, () => `${randInt(1, d * 2)}/${d}`) };
  } else {
    const d1 = pick([2, 3, 4, 5, 6]), d2 = pick([2, 3, 4, 5, 6]);
    const n1 = randInt(1, d1), n2 = randInt(1, d2);
    const lcd = (d1 * d2) / gcd(d1, d2);
    const sum = n1 * (lcd / d1) + n2 * (lcd / d2);
    const g = gcd(sum, lcd);
    return { question: `${n1}/${d1} + ${n2}/${d2} = ?`, answer: `${sum / g}/${lcd / g}`, choices: makeChoices(`${sum / g}/${lcd / g}`, 4, () => `${randInt(1, 12)}/${randInt(2, 12)}`) };
  }
}

// ── Grade 4+: Multi-digit Arithmetic ────────────────────────────────────
function genMultiDigit(grade, difficulty) {
  if (difficulty === 'easy') {
    const a = randInt(10, 99), b = randInt(2, 9);
    const ans = a * b;
    return { question: `${a} × ${b} = ?`, answer: String(ans), choices: makeChoices(ans, 4, () => a * randInt(2, 9)) };
  } else if (difficulty === 'medium') {
    const a = randInt(100, 999), b = randInt(2, 9);
    const ans = a * b;
    return { question: `${a} × ${b} = ?`, answer: String(ans), choices: makeChoices(ans, 4, () => ans + randInt(-50, 50)) };
  } else {
    const b = randInt(2, 9), ans = randInt(10, 99);
    const a = b * ans + randInt(0, b - 1);
    const q = Math.floor(a / b);
    const r = a % b;
    const ansStr = r > 0 ? `${q} R${r}` : String(q);
    return { question: `${a} ÷ ${b} = ?`, answer: ansStr, choices: makeChoices(ansStr, 4, () => r > 0 ? `${q + randInt(-3, 3)} R${randInt(0, b)}` : String(q + randInt(-5, 5))) };
  }
}

// ── Grade 4+: Decimals ──────────────────────────────────────────────────
function genDecimals(grade, difficulty) {
  if (difficulty === 'easy') {
    const a = round2(randInt(1, 20) + randInt(1, 9) / 10);
    const b = round2(randInt(1, 20) + randInt(1, 9) / 10);
    const ans = round2(a + b);
    return { question: `${a} + ${b} = ?`, answer: String(ans), choices: makeChoices(ans, 4, () => round2(ans + randInt(-2, 2) + randInt(-5, 5) / 10)) };
  } else if (difficulty === 'medium') {
    const a = round2(randInt(1, 15) + randInt(1, 99) / 100);
    const b = round2(randInt(1, 9) + randInt(1, 99) / 100);
    const ans = round2(a * b);
    return { question: `${a} × ${b} = ?`, answer: String(ans), choices: makeChoices(ans, 4, () => round2(ans + randInt(-5, 5))) };
  } else {
    const b = round2(randInt(2, 9) + randInt(1, 9) / 10);
    const ans = round2(randInt(2, 20) + randInt(0, 9) / 10);
    const a = round2(b * ans);
    return { question: `${a} ÷ ${b} = ?`, answer: String(ans), choices: makeChoices(ans, 4, () => round2(ans + randInt(-3, 3))) };
  }
}

// ── Grade 5: Order of Operations ────────────────────────────────────────
function genOrderOfOps(grade, difficulty) {
  if (difficulty === 'easy') {
    const a = randInt(2, 10), b = randInt(2, 5), c = randInt(1, 10);
    const ans = a + b * c;
    return { question: `${a} + ${b} × ${c} = ?`, answer: String(ans), choices: makeChoices(ans, 4, () => ans + randInt(-10, 10)) };
  } else if (difficulty === 'medium') {
    const a = randInt(2, 8), b = randInt(2, 8), c = randInt(1, 5);
    const ans = (a + b) * c;
    return { question: `(${a} + ${b}) × ${c} = ?`, answer: String(ans), choices: makeChoices(ans, 4, () => ans + randInt(-10, 10)) };
  } else {
    const a = randInt(2, 6), b = randInt(1, 4), c = randInt(2, 5), d = randInt(1, 8);
    const ans = a * b + c * d;
    return { question: `${a} × ${b} + ${c} × ${d} = ?`, answer: String(ans), choices: makeChoices(ans, 4, () => ans + randInt(-8, 8)) };
  }
}

// ── Grade 6: Ratios & Proportions ───────────────────────────────────────
function genRatios(grade, difficulty) {
  if (difficulty === 'easy') {
    const a = randInt(1, 10), b = randInt(1, 10);
    const g = gcd(a, b);
    return { question: `Simplify the ratio ${a}:${b}`, answer: `${a / g}:${b / g}`, choices: makeChoices(`${a / g}:${b / g}`, 4, () => `${randInt(1, 10)}:${randInt(1, 10)}`) };
  } else {
    const a = randInt(2, 8), b = randInt(2, 8), mult = randInt(2, 5);
    const ans = b * mult;
    return { question: `If ${a}:${b} = ${a * mult}:?, find ?`, answer: String(ans), choices: makeChoices(ans, 4, () => randInt(2, 40)) };
  }
}

// ── Grade 6: Integers ───────────────────────────────────────────────────
function genIntegers(grade, difficulty) {
  const range = difficulty === 'easy' ? 10 : difficulty === 'medium' ? 20 : 50;
  const a = randInt(-range, range), b = randInt(-range, range);
  const ops = difficulty === 'hard' ? ['+', '-', '×'] : ['+', '-'];
  const op = pick(ops);
  const ans = op === '+' ? a + b : op === '-' ? a - b : a * b;
  const display = op === '×' ? '×' : op;
  return { question: `(${a}) ${display} (${b}) = ?`, answer: String(ans), choices: makeChoices(ans, 4, () => ans + randInt(-8, 8)) };
}

// ── Grade 6: Expressions & Equations ────────────────────────────────────
function genExpressions(grade, difficulty) {
  if (difficulty === 'easy' || grade <= 6) {
    const a = randInt(2, 10), ans = randInt(1, 15);
    const b = a * ans;
    return { question: `Solve: ${a}x = ${b}`, answer: String(ans), choices: makeChoices(ans, 4, () => randInt(1, 20)) };
  } else {
    const a = randInt(2, 8), b = randInt(1, 15), ans = randInt(1, 12);
    const c = a * ans + b;
    return { question: `Solve: ${a}x + ${b} = ${c}`, answer: String(ans), choices: makeChoices(ans, 4, () => randInt(1, 15)) };
  }
}

// ── Grade 6: Statistics ─────────────────────────────────────────────────
function genStatistics(grade, difficulty) {
  const count = difficulty === 'easy' ? 4 : difficulty === 'medium' ? 5 : 6;
  const nums = [];
  for (let i = 0; i < count; i++) nums.push(randInt(1, 20));
  const sorted = [...nums].sort((a, b) => a - b);
  const sum = nums.reduce((s, n) => s + n, 0);
  const askType = pick(difficulty === 'easy' ? ['mean'] : ['mean', 'median']);
  if (askType === 'mean') {
    const ans = round2(sum / count);
    return { question: `Find the mean: ${nums.join(', ')}`, answer: String(ans), choices: makeChoices(ans, 4, () => round2(ans + randInt(-3, 3))) };
  } else {
    const mid = Math.floor(count / 2);
    const ans = count % 2 === 0 ? round2((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];
    return { question: `Find the median: ${nums.join(', ')}`, answer: String(ans), choices: makeChoices(ans, 4, () => sorted[randInt(0, count - 1)]) };
  }
}

// ── Grade 5: Volume ─────────────────────────────────────────────────────
function genVolume(grade, difficulty) {
  const l = randInt(2, difficulty === 'easy' ? 5 : 10);
  const w = randInt(2, difficulty === 'easy' ? 5 : 10);
  const h = randInt(2, difficulty === 'easy' ? 5 : 8);
  const ans = l * w * h;
  return { question: `A box is ${l} × ${w} × ${h}. What is the volume?`, answer: String(ans), choices: makeChoices(ans, 4, () => randInt(2, 10) * randInt(2, 10) * randInt(2, 10)) };
}

// ── Grade 6: Area & Surface Area ────────────────────────────────────────
function genArea(grade, difficulty) {
  if (difficulty === 'easy') {
    const l = randInt(2, 12), w = randInt(2, 12);
    const ans = l * w;
    return { question: `Area of a rectangle: length = ${l}, width = ${w}`, answer: String(ans), choices: makeChoices(ans, 4, () => randInt(2, 12) * randInt(2, 12)) };
  } else {
    const b = randInt(3, 15), h = randInt(3, 15);
    const ans = round2(0.5 * b * h);
    return { question: `Area of a triangle: base = ${b}, height = ${h}`, answer: String(ans), choices: makeChoices(ans, 4, () => round2(0.5 * randInt(3, 15) * randInt(3, 15))) };
  }
}

// ── Grade 7+: Proportional Relationships ────────────────────────────────
function genProportional(grade, difficulty) {
  const rate = randInt(2, 12);
  const x = randInt(3, difficulty === 'easy' ? 8 : 15);
  const ans = rate * x;
  return { question: `If 1 item costs $${rate}, how much do ${x} items cost?`, answer: '$' + ans, choices: makeChoices('$' + ans, 4, () => '$' + (rate * randInt(2, 15))) };
}

// ── Grade 7: Probability ────────────────────────────────────────────────
function genProbability(grade, difficulty) {
  const total = pick([6, 8, 10, 12]);
  const favorable = randInt(1, total - 1);
  const g = gcd(favorable, total);
  return { question: `A bag has ${total} balls. ${favorable} are red. What is the probability of picking red?`, answer: `${favorable / g}/${total / g}`, choices: makeChoices(`${favorable / g}/${total / g}`, 4, () => `${randInt(1, total)}/${total}`) };
}

// ── Grade 8: Linear Equations ───────────────────────────────────────────
function genLinearEq(grade, difficulty) {
  const m = randInt(-5, 5) || 1;
  const b = randInt(-10, 10);
  if (difficulty === 'easy') {
    const x = randInt(-5, 5);
    const y = m * x + b;
    return { question: `If y = ${m}x + ${b}, what is y when x = ${x}?`, answer: String(y), choices: makeChoices(y, 4, () => y + randInt(-6, 6)) };
  } else {
    return { question: `What is the slope of y = ${m}x + ${b}?`, answer: String(m), choices: makeChoices(m, 4, () => randInt(-5, 5)) };
  }
}

// ── Grade 8: Exponents & Roots ──────────────────────────────────────────
function genExponents(grade, difficulty) {
  if (difficulty === 'easy') {
    const base = randInt(2, 6), exp = randInt(2, 3);
    const ans = Math.pow(base, exp);
    return { question: `${base}^${exp} = ?`, answer: String(ans), choices: makeChoices(ans, 4, () => Math.pow(randInt(2, 6), randInt(2, 3))) };
  } else if (difficulty === 'medium') {
    const perfect = pick([4, 9, 16, 25, 36, 49, 64, 81, 100, 121, 144]);
    const ans = Math.sqrt(perfect);
    return { question: `√${perfect} = ?`, answer: String(ans), choices: makeChoices(ans, 4, () => randInt(2, 12)) };
  } else {
    const a = randInt(2, 5), b = randInt(1, 3);
    const ans = a + b;
    const base = randInt(2, 4);
    return { question: `Simplify: ${base}^${a} × ${base}^${b} = ${base}^?`, answer: String(ans), choices: makeChoices(ans, 4, () => randInt(2, 10)) };
  }
}

// ── Grade 8: Pythagorean Theorem ────────────────────────────────────────
function genPythagoras(grade, difficulty) {
  const triples = [[3, 4, 5], [5, 12, 13], [6, 8, 10], [8, 15, 17], [7, 24, 25]];
  const [a, b, c] = pick(difficulty === 'easy' ? triples.slice(0, 3) : triples);
  const askC = Math.random() > 0.3;
  if (askC) {
    return { question: `Right triangle: a = ${a}, b = ${b}. Find c.`, answer: String(c), choices: makeChoices(c, 4, () => randInt(c - 4, c + 4)) };
  } else {
    return { question: `Right triangle: a = ${a}, c = ${c}. Find b.`, answer: String(b), choices: makeChoices(b, 4, () => randInt(b - 4, b + 4)) };
  }
}

// ── Grade 9: Quadratic Equations ────────────────────────────────────────
function genQuadratics(grade, difficulty) {
  const r1 = randInt(-6, 6), r2 = randInt(-6, 6);
  const b = -(r1 + r2), c = r1 * r2;
  const bStr = b >= 0 ? `+ ${b}` : `− ${Math.abs(b)}`;
  const cStr = c >= 0 ? `+ ${c}` : `− ${Math.abs(c)}`;
  if (difficulty === 'easy') {
    return { question: `Factor: x² ${bStr}x ${cStr} = 0. Find one root.`, answer: String(r1), choices: makeChoices(r1, 4, () => randInt(-8, 8)) };
  } else {
    const sum = r1 + r2;
    return { question: `x² ${bStr}x ${cStr} = 0. Sum of roots?`, answer: String(sum), choices: makeChoices(sum, 4, () => randInt(-12, 12)) };
  }
}

// ── Grade 9: Polynomials ────────────────────────────────────────────────
function genPolynomials(grade, difficulty) {
  const a1 = randInt(1, 5), a2 = randInt(1, 5);
  const b1 = randInt(-8, 8), b2 = randInt(-8, 8);
  const sumA = a1 + a2, sumB = b1 + b2;
  const bStr = sumB >= 0 ? `+ ${sumB}` : `− ${Math.abs(sumB)}`;
  return { question: `(${a1}x ${b1 >= 0 ? '+ ' + b1 : '− ' + Math.abs(b1)}) + (${a2}x ${b2 >= 0 ? '+ ' + b2 : '− ' + Math.abs(b2)}) = ?`, answer: `${sumA}x ${bStr}`, choices: makeChoices(`${sumA}x ${bStr}`, 4, () => `${randInt(1, 10)}x ${randInt(-10, 10) >= 0 ? '+ ' + randInt(0, 10) : '− ' + randInt(1, 10)}`) };
}

// ── Grade 9: Inequalities ───────────────────────────────────────────────
function genInequalities(grade, difficulty) {
  const a = randInt(2, 8), b = randInt(1, 20);
  const ans = Math.floor(b / a);
  return { question: `Solve: ${a}x ≤ ${b}. Largest integer x?`, answer: String(ans), choices: makeChoices(ans, 4, () => randInt(0, ans + 4)) };
}

// ── Grade 10: Trigonometry ──────────────────────────────────────────────
function genTrig(grade, difficulty) {
  const triples = [[3, 4, 5], [5, 12, 13], [8, 15, 17]];
  const [opp, adj, hyp] = pick(triples);
  const func = pick(['sin', 'cos', 'tan']);
  const ans = func === 'sin' ? `${opp}/${hyp}` : func === 'cos' ? `${adj}/${hyp}` : `${opp}/${adj}`;
  return { question: `Right triangle: opposite = ${opp}, adjacent = ${adj}, hypotenuse = ${hyp}. ${func}(θ) = ?`, answer: ans, choices: makeChoices(ans, 4, () => `${pick([opp, adj, hyp])}/${pick([opp, adj, hyp])}`) };
}

// ── Grade 10+: Systems of Equations ─────────────────────────────────────
function genSystems(grade, difficulty) {
  const x = randInt(-5, 5), y = randInt(-5, 5);
  const a1 = randInt(1, 4), b1 = randInt(1, 4);
  const c1 = a1 * x + b1 * y;
  return { question: `If ${a1}x + ${b1}y = ${c1} and x = ${x}, find y.`, answer: String(y), choices: makeChoices(y, 4, () => randInt(-8, 8)) };
}

// ── Grade 11: Sequences & Series ────────────────────────────────────────
function genSequences(grade, difficulty) {
  if (difficulty !== 'hard') {
    const a1 = randInt(1, 10), d = randInt(1, 8);
    const n = randInt(5, 10);
    const ans = a1 + (n - 1) * d;
    return { question: `Arithmetic sequence: first = ${a1}, common difference = ${d}. Find term ${n}.`, answer: String(ans), choices: makeChoices(ans, 4, () => ans + randInt(-10, 10)) };
  } else {
    const a1 = randInt(1, 5), r = randInt(2, 3);
    const n = randInt(3, 5);
    const ans = a1 * Math.pow(r, n - 1);
    return { question: `Geometric sequence: first = ${a1}, ratio = ${r}. Find term ${n}.`, answer: String(ans), choices: makeChoices(ans, 4, () => a1 * Math.pow(r, randInt(1, 5))) };
  }
}

// ── Grade 11: Financial Math ────────────────────────────────────────────
function genFinancial(grade, difficulty) {
  const P = pick([100, 200, 500, 1000]);
  const r = pick([5, 8, 10]);
  const t = randInt(1, difficulty === 'easy' ? 3 : 5);
  const interest = P * r * t / 100;
  return { question: `Simple interest: $${P} at ${r}% for ${t} years. Interest earned?`, answer: '$' + interest, choices: makeChoices('$' + interest, 4, () => '$' + (P * pick([5, 8, 10]) * randInt(1, 5) / 100)) };
}

// ── Grade 12: Limits ────────────────────────────────────────────────────
function genLimits(grade, difficulty) {
  const a = randInt(1, 5), b = randInt(1, 8);
  const x = randInt(1, 5);
  const ans = a * x + b;
  return { question: `lim(x→${x}) of (${a}x + ${b}) = ?`, answer: String(ans), choices: makeChoices(ans, 4, () => ans + randInt(-5, 5)) };
}

// ── Grade 12: Vectors ───────────────────────────────────────────────────
function genVectors(grade, difficulty) {
  const a = [randInt(-5, 5), randInt(-5, 5)];
  const b = [randInt(-5, 5), randInt(-5, 5)];
  if (difficulty !== 'hard') {
    const ans = `(${a[0] + b[0]}, ${a[1] + b[1]})`;
    return { question: `Add vectors (${a[0]}, ${a[1]}) + (${b[0]}, ${b[1]}) = ?`, answer: ans, choices: makeChoices(ans, 4, () => `(${randInt(-10, 10)}, ${randInt(-10, 10)})`) };
  } else {
    const dot = a[0] * b[0] + a[1] * b[1];
    return { question: `Dot product: (${a[0]}, ${a[1]}) · (${b[0]}, ${b[1]}) = ?`, answer: String(dot), choices: makeChoices(dot, 4, () => dot + randInt(-8, 8)) };
  }
}

// ── Master dispatcher ───────────────────────────────────────────────────
const GENERATORS = {
  'Addition & Subtraction': genAddSub,
  'Place Value': genPlaceValue,
  'Counting': genCounting,
  'Comparing Numbers': genComparing,
  'Patterns': genPatterns,
  'Telling Time': genTellingTime,
  'Elapsed Time': genElapsedTime,
  'Perimeter': genPerimeter,
  'Factors & Multiples': genFactorsMultiples,
  'Angles': genAngles,
  'Percentages': genPercentages,
  'Metric Conversions': genMetricConversions,
  'Percent & Discount': genPercentDiscount,
  'Measurement': genMeasurement12,
  'Geometry': (g, d) => g <= 3 ? genGeometry12(g, d) : genArea(g, d),
  'Money': genMoney,
  'Multiplication & Division': genMulDiv,
  'Fractions': genFractions,
  'Multi-digit Arithmetic': genMultiDigit,
  'Decimals': genDecimals,
  'Order of Operations': genOrderOfOps,
  'Volume': genVolume,
  'Coordinate Plane': (g, d) => genLinearEq(g, d),
  'Ratios & Proportions': genRatios,
  'Integers': genIntegers,
  'Expressions & Equations': genExpressions,
  'Area & Surface Area': genArea,
  'Statistics': genStatistics,
  'Proportional Relationships': genProportional,
  'Operations with Rationals': (g, d) => genDecimals(g, d),
  'Probability & Statistics': genProbability,
  'Linear Equations': genLinearEq,
  'Functions': (g, d) => genLinearEq(g, d),
  'Exponents & Roots': genExponents,
  'Pythagorean Theorem': genPythagoras,
  'Transformations': (g, d) => genGeometry12(g, d),
  'Linear Functions': genLinearEq,
  'Quadratic Equations': genQuadratics,
  'Quadratics': genQuadratics,
  'Polynomials': genPolynomials,
  'Inequalities': genInequalities,
  'Data Analysis': genStatistics,
  'Trigonometry': genTrig,
  'Trigonometric Functions': genTrig,
  'Circle Geometry': genArea,
  'Coordinate Geometry': genLinearEq,
  'Systems of Equations': genSystems,
  'Exponential & Logarithmic': genExponents,
  'Sequences & Series': genSequences,
  'Financial Math': genFinancial,
  'Limits & Derivatives': genLimits,
  'Advanced Functions': genPolynomials,
  'Vectors': genVectors,
  'Proof & Logic': genExponents,
};

// ── Hint generator ──────────────────────────────────────────────────────
const HINTS = {
  'Addition & Subtraction': q => q.question.includes('+') ? 'Add the numbers together. Try breaking them into tens and ones.' : 'Subtract the smaller number from the larger one.',
  'Place Value': () => 'Look at each digit\'s position: ones, tens, hundreds from right to left.',
  'Counting': () => 'Find the pattern: what number is being added each time?',
  'Comparing Numbers': () => 'Look at the digits from left to right. The first digit that is different tells you which is bigger.',
  'Patterns': () => 'Look at how each item changes from one to the next. What stays the same?',
  'Telling Time': () => 'The short hand shows the hour. The long hand shows the minutes. Each number on the clock is 5 minutes.',
  'Elapsed Time': () => 'Count the hours first, then the remaining minutes.',
  'Perimeter': () => 'Add up all the sides. For a rectangle: P = 2 × (length + width).',
  'Factors & Multiples': q => q.question.includes('factor') ? 'A factor divides evenly with no remainder.' : q.question.includes('LCM') ? 'LCM is the smallest number both can divide into evenly.' : 'Multiples are what you get when you multiply by 1, 2, 3, 4...',
  'Angles': q => q.question.includes('complementary') ? 'Complementary angles add up to 90°.' : q.question.includes('straight') ? 'Angles on a straight line add up to 180°.' : 'Acute < 90°, Right = 90°, Obtuse > 90°, Straight = 180°.',
  'Percentages': () => 'Percent means "out of 100". To find 10%, divide by 10. To find 50%, divide by 2.',
  'Metric Conversions': () => 'Remember: 100 cm = 1 m, 1000 m = 1 km, 1000 g = 1 kg, 1000 mL = 1 L.',
  'Percent & Discount': () => 'Find the discount amount first (price × percent ÷ 100), then subtract from the original price.',
  'Measurement': () => 'Compare the numbers. The larger number means longer or bigger.',
  'Geometry': q => q.question.includes('sides') ? 'Count the straight edges of the shape.' : 'Think about the properties of each shape.',
  'Money': () => 'Add up all the coin values. 1¢, 5¢ (nickel), 10¢ (dime), 25¢ (quarter).',
  'Multiplication & Division': q => q.question.includes('×') ? 'Multiply: think of it as groups. e.g., 3 × 4 = 3 groups of 4.' : 'Division is the reverse of multiplication. What times the divisor gives you the number?',
  'Fractions': q => q.question.includes('Simplify') ? 'Divide both top and bottom by the same number.' : 'Find a common denominator first, then add the tops.',
  'Multi-digit Arithmetic': q => q.question.includes('×') ? 'Break the big number into parts, multiply each, then add.' : 'How many times does the divisor fit into the number?',
  'Decimals': () => 'Line up the decimal points, then compute like whole numbers.',
  'Order of Operations': () => 'Remember BEDMAS/PEMDAS: Brackets first, then Exponents, Division/Multiplication, Addition/Subtraction.',
  'Ratios & Proportions': () => 'Divide both sides by the same number to simplify.',
  'Integers': () => 'Two negatives make a positive when multiplying. Adding a negative is like subtracting.',
  'Expressions & Equations': () => 'Get x alone on one side. Do the same operation to both sides.',
  'Statistics': q => q.question.includes('mean') ? 'Mean = add all numbers, then divide by how many there are.' : 'Median = put numbers in order, pick the middle one.',
  'Volume': () => 'Volume = length × width × height.',
  'Area & Surface Area': q => q.question.includes('triangle') ? 'Area of triangle = ½ × base × height.' : 'Area of rectangle = length × width.',
  'Proportional Relationships': () => 'Multiply the rate by the quantity.',
  'Probability & Statistics': () => 'Probability = favorable outcomes ÷ total outcomes.',
  'Linear Equations': q => q.question.includes('slope') ? 'In y = mx + b, the slope is m (the number before x).' : 'Plug in the x value and calculate.',
  'Exponents & Roots': q => q.question.includes('√') ? 'What number multiplied by itself gives this?' : 'Multiply the base by itself, the exponent number of times.',
  'Pythagorean Theorem': () => 'a² + b² = c². The longest side is always c (hypotenuse).',
  'Quadratic Equations': () => 'Find two numbers that multiply to c and add to b.',
  'Quadratics': () => 'Find two numbers that multiply to c and add to b.',
  'Polynomials': () => 'Combine like terms: add the x-coefficients, then add the constants.',
  'Inequalities': () => 'Solve like an equation, then find the largest integer that works.',
  'Trigonometry': () => 'SOH-CAH-TOA: Sin = Opposite/Hypotenuse, Cos = Adjacent/Hypotenuse, Tan = Opposite/Adjacent.',
  'Trigonometric Functions': () => 'SOH-CAH-TOA: Sin = Opposite/Hypotenuse, Cos = Adjacent/Hypotenuse, Tan = Opposite/Adjacent.',
  'Systems of Equations': () => 'Plug in the known value and solve for the unknown.',
  'Sequences & Series': q => q.question.includes('Arithmetic') ? 'nth term = first + (n-1) × difference.' : 'nth term = first × ratio^(n-1).',
  'Financial Math': () => 'Simple Interest = Principal × Rate × Time ÷ 100.',
  'Limits & Derivatives': () => 'Plug the value directly into the expression.',
  'Vectors': q => q.question.includes('Add') ? 'Add each component separately: (x₁+x₂, y₁+y₂).' : 'Dot product: multiply matching components, then add.',
};

// ── Steps generator ─────────────────────────────────────────────────────
function generateSteps(q) {
  const text = q.question;
  // Guide the method only — never compute or reveal any part of the answer
  if (text.match(/\+/)) return [
    'Step 1: Start from the rightmost digits and add each column',
    'Step 2: If a column adds to 10 or more, carry the 1 to the next column'
  ];
  if (text.match(/[−\-]/)) return [
    'Step 1: Start from the rightmost digits and subtract each column',
    'Step 2: If the top digit is smaller, borrow 1 from the next column'
  ];
  if (text.match(/[×x]/)) return [
    'Step 1: Multiply each digit of the bottom number by the top number',
    'Step 2: Add up all the partial results to get your answer'
  ];
  if (text.match(/÷/)) return [
    'Step 1: Ask yourself how many times the divisor fits into the dividend',
    'Step 2: Multiply back to check: divisor × your answer should equal the dividend'
  ];
  if (text.match(/Simplify/i)) return [
    'Step 1: Find a number that divides evenly into both the top and bottom',
    'Step 2: Keep dividing until you can\'t simplify any further'
  ];
  if (text.match(/Solve/i)) return [
    'Step 1: Get the variable alone on one side of the equation',
    'Step 2: Whatever you do to one side, do the same to the other side'
  ];
  if (text.match(/Factor/i)) return [
    'Step 1: Find two numbers that multiply to the constant term',
    'Step 2: Check that those two numbers also add up to the middle coefficient'
  ];
  if (text.match(/lim/i)) return [
    'Step 1: Try plugging the value directly into the expression',
    'Step 2: If that works, that\'s your limit'
  ];
  if (text.match(/Compare:/i)) return [
    'Step 1: Look at both numbers carefully',
    'Step 2: Decide which one is bigger, or if they are equal'
  ];
  if (text.match(/pattern|comes next/i)) return [
    'Step 1: Look at how the numbers or shapes change each time',
    'Step 2: Apply the same change to find what comes next'
  ];
  if (text.match(/clock|time|hour|minutes past/i)) return [
    'Step 1: The short hand shows the hour',
    'Step 2: The long hand shows minutes — each number is 5 minutes'
  ];
  if (text.match(/elapsed|starts at|Start:|From.*to/i)) return [
    'Step 1: Count the full hours between start and end',
    'Step 2: Then count any remaining minutes'
  ];
  if (text.match(/perimeter/i)) return [
    'Step 1: Identify all the sides of the shape',
    'Step 2: Add them all together to get the perimeter'
  ];
  if (text.match(/factor of/i)) return [
    'Step 1: Divide the bigger number by the smaller one',
    'Step 2: If there is no remainder, it is a factor'
  ];
  if (text.match(/multiple of|LCM/i)) return [
    'Step 1: List the multiples of each number',
    'Step 2: Find the smallest number that appears in both lists'
  ];
  if (text.match(/angle|°/i)) return [
    'Step 1: Remember: acute < 90°, right = 90°, obtuse > 90°',
    'Step 2: Angles on a straight line add up to 180°, complementary add to 90°'
  ];
  if (text.match(/percent|%/i)) return [
    'Step 1: Percent means "out of 100"',
    'Step 2: Multiply the total by the percent, then divide by 100'
  ];
  if (text.match(/Convert/i)) return [
    'Step 1: Remember the conversion factor (e.g., 100 cm = 1 m)',
    'Step 2: Multiply or divide by that factor'
  ];
  if (text.match(/sale price|discount|% off/i)) return [
    'Step 1: Calculate the discount: price × percent ÷ 100',
    'Step 2: Subtract the discount from the original price'
  ];
  if (text.match(/triangle|sides|shape/i)) return [
    'Step 1: Think about the properties of the shape mentioned',
    'Step 2: Use what you know about that shape to find the answer'
  ];
  if (text.match(/mean|median|average/i)) return [
    'Step 1: For the mean, add all numbers then divide by how many there are',
    'Step 2: For the median, put numbers in order and find the middle one'
  ];
  return [
    'Step 1: Read the problem carefully and figure out what operation to use',
    'Step 2: Work through it one piece at a time — don\'t rush!'
  ];
}

// ── French translation helper ───────────────────────────────────────────
function translateToFrench(question) {
  return question
    .replace(/What is the sale price\?/gi, 'Quel est le prix soldé ?')
    .replace(/What is the perimeter\?/gi, 'Quel est le périmètre ?')
    .replace(/What time does the clock show\?/gi, 'Quelle heure affiche l\'horloge ?')
    .replace(/What time is it\?/gi, 'Quelle heure est-il ?')
    .replace(/What is/gi, 'Quel est')
    .replace(/What comes next\?/gi, 'Quel est le prochain nombre ?')
    .replace(/What percent off\?/gi, 'Quel pourcentage de réduction ?')
    .replace(/How many sides does a/gi, 'Combien de côtés a un')
    .replace(/How many minutes past/gi, 'Combien de minutes après')
    .replace(/How many minutes/gi, 'Combien de minutes')
    .replace(/How many hours\?/gi, 'Combien d\'heures ?')
    .replace(/How many/gi, 'Combien')
    .replace(/How much do you save\?/gi, 'Combien économisez-vous ?')
    .replace(/How much is/gi, 'Combien font')
    .replace(/Which is the smallest\?/gi, 'Lequel est le plus petit ?')
    .replace(/Which is the largest\?/gi, 'Lequel est le plus grand ?')
    .replace(/Find the pattern and next number/gi, 'Trouvez le motif et le prochain nombre')
    .replace(/An angle of/gi, 'Un angle de')
    .replace(/is called\?/gi, 's\'appelle ?')
    .replace(/Two complementary angles/gi, 'Deux angles complémentaires')
    .replace(/Two angles on a straight line/gi, 'Deux angles sur une ligne droite')
    .replace(/Convert/gi, 'Convertissez')
    .replace(/to meters/gi, 'en mètres')
    .replace(/to kilograms/gi, 'en kilogrammes')
    .replace(/to millimeters/gi, 'en millimètres')
    .replace(/to liters/gi, 'en litres')
    .replace(/to kilometers/gi, 'en kilomètres')
    .replace(/Is .+ a factor of/gi, 'Est-ce un facteur de')
    .replace(/What is the LCM of/gi, 'Quel est le PPCM de')
    .replace(/multiple of/gi, 'multiple de')
    .replace(/percent of/gi, 'pour cent de')
    .replace(/School starts at/gi, 'L\'école commence à')
    .replace(/and ends at/gi, 'et finit à')
    .replace(/Start:/gi, 'Début :')
    .replace(/End:/gi, 'Fin :')
    .replace(/passed\?/gi, 'écoulées ?')
    .replace(/Original price/gi, 'Prix original')
    .replace(/Sale price/gi, 'Prix soldé')
    .replace(/discount/gi, 'réduction')
    .replace(/Which shape has/gi, 'Quelle forme a')
    .replace(/Which is longer\?/gi, 'Lequel est plus long ?')
    .replace(/Find the mean/gi, 'Trouvez la moyenne')
    .replace(/Find the median/gi, 'Trouvez la médiane')
    .replace(/Find one root/gi, 'Trouvez une racine')
    .replace(/Find/gi, 'Trouvez')
    .replace(/Solve/gi, 'Résolvez')
    .replace(/Simplify/gi, 'Simplifiez')
    .replace(/Compare/gi, 'Comparez')
    .replace(/Add vectors/gi, 'Additionnez les vecteurs')
    .replace(/Dot product/gi, 'Produit scalaire')
    .replace(/A box is/gi, 'Une boîte mesure')
    .replace(/volume/gi, 'le volume')
    .replace(/Area of a rectangle/gi, 'Aire d\'un rectangle')
    .replace(/Area of a triangle/gi, 'Aire d\'un triangle')
    .replace(/Right triangle/gi, 'Triangle rectangle')
    .replace(/A bag has/gi, 'Un sac contient')
    .replace(/are red/gi, 'sont rouges')
    .replace(/probability of picking red/gi, 'probabilité de choisir une rouge')
    .replace(/A clock shows/gi, 'Une horloge affiche')
    .replace(/What hour is it\?/gi, 'Quelle heure est-il ?')
    .replace(/the tens digit/gi, 'le chiffre des dizaines')
    .replace(/the ones digit/gi, 'le chiffre des unités')
    .replace(/the hundreds digit/gi, 'le chiffre des centaines')
    .replace(/sides/gi, 'côtés')
    .replace(/length/gi, 'longueur')
    .replace(/width/gi, 'largeur')
    .replace(/height/gi, 'hauteur')
    .replace(/base/gi, 'base')
    .replace(/Largest integer/gi, 'Plus grand entier')
    .replace(/first/gi, 'premier')
    .replace(/common difference/gi, 'raison')
    .replace(/term/gi, 'terme')
    .replace(/items? cost/gi, 'articles coûtent')
    .replace(/If 1 item costs/gi, 'Si 1 article coûte')
    .replace(/Simple interest/gi, 'Intérêt simple')
    .replace(/years/gi, 'ans')
    .replace(/Interest earned\?/gi, 'Intérêt gagné ?')
    .replace(/Sum of roots\?/gi, 'Somme des racines ?')
    .replace(/Factor/gi, 'Factorisez')
    .replace(/slope/gi, 'la pente')
    .replace(/ of /g, ' de ')
    .replace(/\?$/, ' ?');
}

function generateQuestion(grade, topic, difficulty) {
  const gen = GENERATORS[topic];
  if (!gen) return genAddSub(grade, difficulty);
  const q = gen(grade, difficulty);
  // Attach hint
  const hintFn = HINTS[topic];
  q.hint = hintFn ? hintFn(q) : 'Think carefully about the problem.';
  // Attach steps
  q.steps = generateSteps(q);
  // Attach French translation
  q.questionFr = translateToFrench(q.question);
  return q;
}

// ── END PORTED SECTION ──────────────────────────────────────────────────

// ── Server-side pool loading (bundled copies — see header comment) ───────
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadJsonPool(filename) {
  try {
    const raw = readFileSync(path.join(__dirname, 'data', filename), 'utf-8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.error(`Failed to load ${filename}:`, e.message);
    return [];
  }
}

const HAND_CURATED_POOL = loadJsonPool('practice-pool.json');
const EXTENDED_POOL = loadJsonPool('practice-pool-extended.json');

// Production-safety gate: the GSM8K-derived pool is only ever included in a
// server-issued session when this is explicitly turned on (Vercel env var).
// Unset/anything other than the literal string 'true' = disabled. This is
// the REAL production gate now — stronger than the frontend's old
// query-param/hostname check, since a session's questions are generated
// here, server-side, regardless of what any client sends.
function isExtendedPoolEnabled() {
  return process.env.EXTENDED_POOL_ENABLED === 'true';
}

function getServerPoolQuestions(grade, topics) {
  let pool = HAND_CURATED_POOL.slice();
  if (isExtendedPoolEnabled()) pool = pool.concat(EXTENDED_POOL);
  return pool.filter(q =>
    q.grade === grade &&
    (topics.length === 0 || topics.some(t =>
      t.toLowerCase().includes((q.topic || '').toLowerCase().split(' ')[0] || '') ||
      (q.topic || '').toLowerCase().includes(t.toLowerCase().split(' ')[0] || '')
    ))
  );
}

function makeServerPoolQuestion(pq) {
  return {
    question: pq.question,
    questionFr: pq.questionFr || '',
    answer: String(pq.answer),
    choices: pq.choices.map(String),
    hint: pq.hint || 'Think carefully about this problem.',
    steps: pq.steps || ['Read the problem carefully', 'Find the answer'],
    topic: pq.topic || 'Word Problem',
    _source: pq._source || 'chatgpt',
    _sourceId: pq._sourceId || null,
  };
}

function shuffleArr(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Server-side equivalent of the frontend's generateQuiz() — same blending
 * rules (100% pool for "Word Problems"-only, ~40% pool blend otherwise,
 * algorithmic fallback when the pool runs short), but this is the copy that
 * actually gets scored: practice-session-start.js stores its output
 * (including answers) in practice_sessions, and practice-submit.js verifies
 * submissions against that stored copy, not anything the client claims.
 */
export function generatePracticeQuestions(grade, topics, difficulty, count) {
  const questions = [];
  const isWordProblems = topics.length === 1 && topics[0] === 'Word Problems';

  if (isWordProblems) {
    const poolQs = getServerPoolQuestions(grade, []);
    const usedPool = shuffleArr([...poolQs]).slice(0, count);
    usedPool.forEach(pq => questions.push(makeServerPoolQuestion(pq)));
    const remaining = count - questions.length;
    for (let i = 0; i < remaining; i++) {
      const topic = pick(getTopicsForGrade(grade).filter(t => t !== 'Word Problems'));
      questions.push({ ...generateQuestion(grade, topic, difficulty), topic, _source: 'algorithmic' });
    }
    return shuffleArr(questions);
  }

  const nonWordTopics = topics.filter(t => t !== 'Word Problems');
  const poolQs = getServerPoolQuestions(grade, nonWordTopics);
  const poolCount = Math.min(Math.floor(count * 0.4), poolQs.length);
  const usedPool = shuffleArr([...poolQs]).slice(0, poolCount);
  usedPool.forEach(pq => questions.push(makeServerPoolQuestion(pq)));

  const algoTopics = nonWordTopics.length > 0 ? nonWordTopics : getTopicsForGrade(grade).filter(t => t !== 'Word Problems');
  const remaining = count - questions.length;
  for (let i = 0; i < remaining; i++) {
    const topic = algoTopics[i % algoTopics.length];
    questions.push({ ...generateQuestion(grade, topic, difficulty), topic, _source: 'algorithmic' });
  }
  return shuffleArr(questions);
}

export { isExtendedPoolEnabled };
