import unittest, threading, json, urllib.request, urllib.error
from http.server import ThreadingHTTPServer
from agents.server import Handler
from app import App
import client

class WorkflowTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.servers=[]
        client.AGENT_URLS={}
        for kind,port in (('research',18201),('analysis',18202),('writer',18203)):
            h=type('TestHandler',(Handler,),{'kind':kind})
            s=ThreadingHTTPServer(('127.0.0.1',port),h); threading.Thread(target=s.serve_forever,daemon=True).start()
            cls.servers.append(s); client.AGENT_URLS[kind]=f'http://127.0.0.1:{port}'
        cls.app=ThreadingHTTPServer(('127.0.0.1',18200),App)
        threading.Thread(target=cls.app.serve_forever,daemon=True).start(); cls.servers.append(cls.app)
    @classmethod
    def tearDownClass(cls):
        for s in cls.servers: s.shutdown(); s.server_close()
    def test_three_agent_workflow_returns_artifact(self):
        result=client.run_workflow('AI can help teams organize information. Human review remains important.')
        self.assertIn('MULTI-AGENT REPORT',result['report'])
        self.assertEqual(set(result['agents']),{'research','analysis','writer'})
        self.assertTrue(all(v['task']['status']['state']=='completed' for v in result['agents'].values()))
    def test_empty_input_rejected(self):
        with self.assertRaises(ValueError): client.run_workflow('   ')
    def test_browser_api_runs_complete_workflow(self):
        req=urllib.request.Request('http://127.0.0.1:18200/api/run',data=json.dumps({'topic':'A2A lets agents collaborate.'}).encode(),headers={'Content-Type':'application/json'})
        with urllib.request.urlopen(req,timeout=10) as response: result=json.loads(response.read())
        self.assertIn('MULTI-AGENT REPORT',result['report'])
        self.assertEqual(len(result['agents']),3)
    def test_stream_emits_discovery_progress_and_result(self):
        req=urllib.request.Request('http://127.0.0.1:18200/api/run-stream',data=json.dumps({'topic':'Agents share work through tasks.'}).encode(),headers={'Content-Type':'application/json'})
        with urllib.request.urlopen(req,timeout=10) as response:
            events=[json.loads(line) for line in response.read().decode().splitlines() if line.strip()]
        states=[(e.get('key'),e.get('state')) for e in events if e['type']=='progress']
        self.assertEqual(states[0],('coordinator','discovered'))
        self.assertEqual(states[1:],[('research','running'),('research','completed'),('analysis','running'),('analysis','completed'),('writer','running'),('writer','completed')])
        self.assertEqual(events[-1]['type'],'result')
        self.assertIn('MULTI-AGENT REPORT',events[-1]['data']['report'])
    def test_stream_rejects_empty_topic(self):
        req=urllib.request.Request('http://127.0.0.1:18200/api/run-stream',data=json.dumps({'topic':'  '}).encode(),headers={'Content-Type':'application/json'})
        with self.assertRaises(urllib.error.HTTPError) as ctx: urllib.request.urlopen(req,timeout=10)
        self.assertEqual(ctx.exception.code,400)
    def test_static_assets_served_and_traversal_blocked(self):
        for name,ctype in (('styles.css','text/css'),('grid.js','text/javascript'),('fx.js','text/javascript'),('app.js','text/javascript')):
            with urllib.request.urlopen('http://127.0.0.1:18200/static/'+name) as response:
                self.assertIn(ctype,response.headers['Content-Type'])
        for bad in ('/static/../app.py','/static/..%2fapp.py','/static/nope.js'):
            with self.assertRaises(urllib.error.HTTPError) as ctx: urllib.request.urlopen('http://127.0.0.1:18200'+bad)
            self.assertEqual(ctx.exception.code,404)
    def test_dashboard_is_served(self):
        with urllib.request.urlopen('http://127.0.0.1:18200/') as response: page=response.read().decode()
        self.assertIn('One task.',page)
        self.assertIn('Run multi-agent workflow',page)

if __name__=='__main__': unittest.main()
