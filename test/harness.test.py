# Layer 4 — Python harness replica test.
# The _run / _eval / _collect_ast_names below are copied VERBATIM from the worker
# HARNESS in src/runtimes/python.worker.ts. We drive each lesson's setup +
# reference solution through them and replicate the unit/stdout verifier logic to
# confirm every reference solution passes its OWN visible and hidden cases.
import sys, io, ast, json

_ns = {}

def _collect_ast_names(src):
    names = set()
    try:
        tree = ast.parse(src)
    except SyntaxError:
        return []
    for node in ast.walk(tree):
        if isinstance(node, ast.Name):
            names.add(node.id)
        elif isinstance(node, ast.Attribute):
            names.add(node.attr)
        elif isinstance(node, ast.keyword) and node.arg:
            names.add(node.arg)
        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            names.add(node.name)
        elif isinstance(node, (ast.For, ast.While, ast.If, ast.Try, ast.With)):
            names.add(type(node).__name__.lower())
    return sorted(names)

def _run(setup_src, student_src):
    global _ns
    _ns = {}
    out, err = io.StringIO(), io.StringIO()
    old_out, old_err = sys.stdout, sys.stderr
    sys.stdout, sys.stderr = out, err
    crashed = False
    try:
        if setup_src:
            exec(setup_src, _ns)
        exec(student_src, _ns)
    except Exception as e:
        crashed = True
        print(repr(e), file=sys.stderr)
    finally:
        sys.stdout, sys.stderr = old_out, old_err
    _ns['__ast_names__'] = _collect_ast_names(student_src)
    safe_ns = {}
    for k, v in _ns.items():
        if k.startswith('__') and k != '__ast_names__':
            continue
        try:
            json.dumps(v)
            safe_ns[k] = v
        except (TypeError, ValueError):
            pass
    return {'stdout': out.getvalue(), 'stderr': err.getvalue(), 'namespace': safe_ns, 'crashed': crashed}

def _eval(expr):
    try:
        value = eval(expr, _ns)
        try:
            json.dumps(value)
        except (TypeError, ValueError):
            value = repr(value)
        return {'value': value, 'error': None}
    except Exception as e:
        return {'value': None, 'error': repr(e)}

# ---- end verbatim harness ----

PASS = 0
FAIL = 0
fails = []
def check(name, cond, extra=''):
    global PASS, FAIL
    if cond: PASS += 1
    else:
        FAIL += 1
        fails.append(name + (' — ' + extra if extra else ''))
    print(('PASS' if cond else 'FAIL') + '  ' + name + (('  — ' + extra) if extra else ''))

SETUP_01 = '''
class _Resp:
    def __init__(self, status=200):
        self.status_code = status
def get(url):
    return _Resp(200 if url == "/ping" else 404)
'''
SOL_01 = 'response = get("/ping")\nprint(response.status_code)'

SETUP_02 = '''
class _Resp:
    def __init__(self, payload, status=200):
        self._payload = payload; self.status_code = status
    def json(self): return self._payload
_DB = {"/users/7": {"id": 7, "name": "Aarav"}}
def get(url):
    return _Resp(_DB.get(url, {}), 200 if url in _DB else 404)
'''
SOL_02 = 'def exists(url):\n    return get(url).status_code == 200'

SETUP_03 = '''
import json
class _Resp:
    def __init__(self, payload, status=200):
        self._payload = payload; self.status_code = status
    def json(self): return self._payload
_DB = {"/users/7": {"id": 7, "name": "Aarav", "city": "Bengaluru"}}
def get(url):
    return _Resp(_DB.get(url, {}), 200 if url in _DB else 404)
'''
SOL_03 = ('def city_of(url):\n'
          '    r = get(url)\n'
          '    if r.status_code != 200:\n'
          '        return None\n'
          '    return r.json()["city"]')

# ---- Lesson 01: stdout verifier ----
r = _run(SETUP_01, SOL_01)
check('L01 run does not crash', r['crashed'] is False, r['stderr'].strip())
check('L01 stdout trims to "200"', r['stdout'].strip() == '200', repr(r['stdout']))

# ---- Lesson 02: unit verifier (visible + hidden) ----
r = _run(SETUP_02, SOL_02)
check('L02 run does not crash', r['crashed'] is False, r['stderr'].strip())
cases_02 = [("exists('/users/7')", True), ("exists('/missing')", False), ("exists('/users/404')", False)]
for call, want in cases_02:
    ev = _eval(call)
    check(f'L02 {call} == {want}', ev['error'] is None and ev['value'] == want, f"got={ev['value']!r} err={ev['error']}")

# ---- Lesson 03: unit verifier (visible + hidden) ----
r = _run(SETUP_03, SOL_03)
check('L03 run does not crash', r['crashed'] is False, r['stderr'].strip())
cases_03 = [("city_of('/users/7')", 'Bengaluru'), ("city_of('/users/0')", None)]
for call, want in cases_03:
    ev = _eval(call)
    check(f'L03 {call} == {want!r}', ev['error'] is None and ev['value'] == want, f"got={ev['value']!r} err={ev['error']}")

# ---- Sanity: harness mechanics ----
# crash path: undefined name should set crashed and capture repr in stderr
rc = _run('', 'print(undefined_name)')
check('crash path sets crashed=True', rc['crashed'] is True)
check('crash path captures error in stderr', 'NameError' in rc['stderr'])
# ast names collected from source
ra = _run('', 'def f(x):\n    return x\nfor i in range(3):\n    pass')
names = ra['namespace'].get('__ast_names__', [])
check('ast collects funcdef name + loop kw', 'f' in names and 'for' in names, repr(names))
# non-serializable / dunder names are dropped from namespace, __ast_names__ kept
check('namespace excludes callables/dunders, keeps __ast_names__',
      'f' not in {k: v for k, v in ra['namespace'].items() if k != '__ast_names__'} and '__ast_names__' in ra['namespace'])

print(f"\n==== Layer 4 python harness tests: {PASS} passed, {FAIL} failed ====")
print(f"python: {sys.version.split()[0]}")
if FAIL:
    print('FAILURES:\n' + '\n'.join('  - ' + f for f in fails))
    sys.exit(1)
