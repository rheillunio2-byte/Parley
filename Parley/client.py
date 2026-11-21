"""Client-agent orchestrator: discovers remote Agent Cards and delegates tasks."""
import json, urllib.request, urllib.error, uuid

AGENT_URLS = {
    "research": "http://127.0.0.1:18101",
    "analysis": "http://127.0.0.1:18102",
    "writer": "http://127.0.0.1:18103",
}

def get_json(url):
    with urllib.request.urlopen(url, timeout=5) as r: return json.loads(r.read().decode())

def discover_agents():
    cards={}
    for key,base in AGENT_URLS.items(): cards[key]=get_json(base+'/.well-known/agent-card.json')
    return cards

def send_task(card, text):
    request={"jsonrpc":"2.0","id":str(uuid.uuid4()),"method":"tasks/send",
             "params":{"message":{"role":"user","parts":[{"type":"text","text":text}]}}}
    data=json.dumps(request).encode()
    req=urllib.request.Request(card['url'],data=data,headers={'Content-Type':'application/json'},method='POST')
    with urllib.request.urlopen(req,timeout=15) as response: result=json.loads(response.read().decode())
    if 'error' in result: raise RuntimeError(result['error'].get('message','Remote agent error'))
    task=result['result']; return task['artifacts'][0]['parts'][0]['text'], task

def run_workflow(topic, progress=None):
    if not topic or not topic.strip(): raise ValueError('Please enter a topic or task.')
    cards=discover_agents(); output={}; current=topic.strip()
    if progress: progress({"key":"coordinator","state":"discovered","cards":cards})
    for key in ('research','analysis','writer'):
        card=cards[key]
        if progress: progress({"key":key,"agent":card['name'],"state":"running","description":card['description']})
        current,task=send_task(card,current); output[key]={"card":card,"task":task,"text":current}
        if progress: progress({"key":key,"agent":card['name'],"state":"completed","artifact":task['artifacts'][0]['name']})
    return {"agents":output,"report":current}
