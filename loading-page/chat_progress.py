"""Read explicitly exposed text/thinking fields without changing provider bytes."""
import codecs
import json


class ProgressTap:
    def __init__(self, emit):
        self.emit = emit
        self.decoder = codecs.getincrementaldecoder('utf-8')('replace')
        self.buffer = ''
        self.lines = []
        self.counts = {'thinking': 0, 'text': 0}

    def publish(self, kind, value):
        if not isinstance(value, str) or not value:
            return
        text = value[:max(0, 12000 - self.counts[kind])]
        if text:
            self.counts[kind] += len(text)
            self.emit({'type': kind, 'delta': text})

    def event(self, raw):
        try:
            value = json.loads(raw)
        except (ValueError, TypeError):
            return
        if not isinstance(value, dict):
            return
        choices = value.get('choices')
        if isinstance(choices, list) and choices and isinstance(choices[0], dict):
            item = choices[0].get('delta') or choices[0].get('message') or {}
            if isinstance(item, dict):
                self.publish('thinking', item.get('reasoning_content') or item.get('reasoning'))
                self.publish('text', item.get('content'))
        kind, delta = value.get('type'), value.get('delta')
        if kind == 'content_block_delta' and isinstance(delta, dict):
            if delta.get('type') == 'thinking_delta':
                self.publish('thinking', delta.get('thinking'))
            elif delta.get('type') == 'text_delta':
                self.publish('text', delta.get('text'))
        elif kind == 'response.output_text.delta':
            self.publish('text', delta)
        elif kind in {'response.reasoning_summary_text.delta', 'response.reasoning_text.delta'}:
            self.publish('thinking', delta)
        # Non-streaming Messages responses are also accepted by some gateways.
        if not kind or kind == 'message':
            for block in value.get('content', []) if isinstance(value.get('content'), list) else []:
                if isinstance(block, dict):
                    if block.get('type') == 'thinking':
                        self.publish('thinking', block.get('thinking'))
                    elif block.get('type') == 'text':
                        self.publish('text', block.get('text'))

    def feed(self, chunk):
        self.buffer += self.decoder.decode(chunk)
        if len(self.buffer) > 131072:
            self.buffer = ''
            self.lines = []
            return
        # Keep whole JSON responses intact until finish().
        if self.buffer.lstrip().startswith('{'):
            return
        while '\n' in self.buffer:
            line, self.buffer = self.buffer.split('\n', 1)
            line = line.rstrip('\r')
            if line.startswith('data:'):
                self.lines.append(line[5:].lstrip(' '))
            elif not line and self.lines:
                self.event('\n'.join(self.lines))
                self.lines = []

    def finish(self):
        self.buffer += self.decoder.decode(b'', final=True)
        if self.buffer.lstrip().startswith('{'):
            self.event(self.buffer)
        else:
            if self.buffer.startswith('data:'):
                self.lines.append(self.buffer[5:].strip())
            if self.lines:
                self.event('\n'.join(self.lines))
        self.buffer = ''
        self.lines = []
