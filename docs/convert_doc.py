import re

def convert_md_to_html(md_path, html_path):
    with open(md_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    html = []
    html.append('''<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Master Project Blueprint & Defense Architecture</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.css">
  <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.js"></script>
  <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/contrib/auto-render.min.js" onload="renderMathInElement(document.body);"></script>
  <script type="module">
    import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';
    mermaid.initialize({ startOnLoad: true, theme: 'neutral' });
  </script>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');

    :root {
      --primary: #0f172a;
      --accent: #2563eb;
      --accent-light: #eff6ff;
      --text: #334155;
      --text-dark: #0f172a;
      --bg: #f8fafc;
      --card-bg: #ffffff;
      --border: #cbd5e1;
      --code-bg: #0f172a;
    }

    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      color: var(--text);
      background-color: var(--bg);
      line-height: 1.7;
      margin: 0;
      padding: 40px 20px;
    }

    .container {
      max-width: 1000px;
      margin: 0 auto;
      background: var(--card-bg);
      padding: 60px 70px;
      border-radius: 16px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.06);
      border: 1px solid var(--border);
    }

    h1, h2, h3, h4, h5 {
      color: var(--text-dark);
      font-weight: 700;
      letter-spacing: -0.02em;
    }

    h1 {
      font-size: 2.2rem;
      border-bottom: 3px solid var(--accent);
      padding-bottom: 12px;
      margin-top: 0;
      margin-bottom: 8px;
    }

    h2 {
      font-size: 1.5rem;
      margin-top: 42px;
      margin-bottom: 16px;
      border-bottom: 2px solid var(--border);
      padding-bottom: 8px;
      color: var(--primary);
    }

    h3 {
      font-size: 1.25rem;
      margin-top: 28px;
      margin-bottom: 12px;
      color: var(--accent);
    }

    h4 {
      font-size: 1.05rem;
      margin-top: 20px;
      margin-bottom: 10px;
      color: var(--text-dark);
    }

    p {
      margin-bottom: 16px;
      font-size: 1rem;
    }

    hr {
      border: none;
      border-top: 1px solid var(--border);
      margin: 35px 0;
    }

    blockquote {
      background: var(--accent-light);
      border-left: 5px solid var(--accent);
      margin: 24px 0;
      padding: 18px 24px;
      border-radius: 0 10px 10px 0;
      font-style: italic;
      color: var(--text-dark);
      font-size: 1.02rem;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin: 28px 0;
      font-size: 0.93rem;
    }

    th, td {
      padding: 12px 16px;
      text-align: left;
      border: 1px solid var(--border);
    }

    th {
      background-color: #f1f5f9;
      color: var(--text-dark);
      font-weight: 700;
    }

    tr:nth-child(even) {
      background-color: #f8fafc;
    }

    pre {
      background-color: var(--code-bg);
      color: #f8fafc;
      padding: 20px;
      border-radius: 10px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.88rem;
      overflow-x: auto;
      line-height: 1.55;
      margin: 24px 0;
    }

    code {
      font-family: 'JetBrains Mono', monospace;
      background: #f1f5f9;
      color: #0f172a;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 0.9em;
    }

    pre code {
      background: transparent;
      color: inherit;
      padding: 0;
    }

    ul, ol {
      padding-left: 26px;
      margin-bottom: 22px;
    }

    li {
      margin-bottom: 8px;
    }

    .mermaid {
      margin: 30px 0;
      text-align: center;
      background: #f8fafc;
      padding: 20px;
      border-radius: 10px;
      border: 1px solid var(--border);
    }

    @media print {
      body { background: white; padding: 0; }
      .container { box-shadow: none; border: none; padding: 0; max-width: 100%; }
    }
  </style>
</head>
<body>
  <div class="container">
''')

    in_code_block = False
    code_lang = ''
    code_buffer = []

    in_table = False
    table_buffer = []

    for line in lines:
        raw_line = line.rstrip('\n')

        # Code blocks
        if raw_line.startswith('```'):
            if in_code_block:
                in_code_block = False
                content = '\n'.join(code_buffer)
                if code_lang == 'mermaid':
                    html.append(f'<div class="mermaid">\n{content}\n</div>')
                else:
                    escaped = content.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
                    html.append(f'<pre><code>{escaped}</code></pre>')
                code_buffer = []
            else:
                in_code_block = True
                code_lang = raw_line[3:].strip()
            continue

        if in_code_block:
            code_buffer.append(raw_line)
            continue

        # Tables
        if '|' in raw_line and raw_line.strip().startswith('|'):
            if not in_table:
                in_table = True
                table_buffer = []
            table_buffer.append(raw_line)
            continue
        elif in_table:
            in_table = False
            # parse table_buffer
            html.append(parse_table(table_buffer))
            table_buffer = []

        # Headings
        if raw_line.startswith('# '):
            html.append(f'<h1>{inline_fmt(raw_line[2:])}</h1>')
        elif raw_line.startswith('## '):
            html.append(f'<h2>{inline_fmt(raw_line[3:])}</h2>')
        elif raw_line.startswith('### '):
            html.append(f'<h3>{inline_fmt(raw_line[4:])}</h3>')
        elif raw_line.startswith('#### '):
            html.append(f'<h4>{inline_fmt(raw_line[5:])}</h4>')
        elif raw_line.startswith('---'):
            html.append('<hr>')
        elif raw_line.startswith('> '):
            html.append(f'<blockquote>{inline_fmt(raw_line[2:])}</blockquote>')
        elif raw_line.startswith('- ') or raw_line.startswith('* '):
            html.append(f'<ul><li>{inline_fmt(raw_line[2:])}</li></ul>')
        elif re.match(r'^\d+\.\s', raw_line):
            text = re.sub(r'^\d+\.\s', '', raw_line)
            html.append(f'<ol><li>{inline_fmt(text)}</li></ol>')
        elif raw_line.strip() == '':
            continue
        else:
            html.append(f'<p>{inline_fmt(raw_line)}</p>')

    if in_table:
        html.append(parse_table(table_buffer))

    html.append('''
  </div>
</body>
</html>
''')

    # Post process ul and ol collapsing
    full_html = '\n'.join(html)
    full_html = re.sub(r'</ul>\s*<ul>', '', full_html)
    full_html = re.sub(r'</ol>\s*<ol>', '', full_html)

    with open(html_path, 'w', encoding='utf-8') as f:
        f.write(full_html)

def parse_table(table_lines):
    rows = []
    for line in table_lines:
        cells = [c.strip() for c in line.strip().strip('|').split('|')]
        rows.append(cells)

    if len(rows) < 2:
        return ''

    headers = rows[0]
    # Check separator line
    data_rows = rows[2:] if len(rows) > 2 and '---' in rows[1][0] else rows[1:]

    out = ['<table>', '<thead>', '<tr>']
    for h in headers:
        out.append(f'<th>{inline_fmt(h)}</th>')
    out.append('</tr>')
    out.append('</thead>')
    out.append('<tbody>')

    for row in data_rows:
        out.append('<tr>')
        for c in row:
            out.append(f'<td>{inline_fmt(c)}</td>')
        out.append('</tr>')

    out.append('tbody>')
    out.append('</table>')
    return '\n'.join(out)

def inline_fmt(text):
    text = re.sub(r'\*\*(.*?)\*\*', r'<strong>\1</strong>', text)
    text = re.sub(r'\*(.*?)\*', r'<em>\1</em>', text)
    text = re.sub(r'`(.*?)`', r'<code>\1</code>', text)
    return text

if __name__ == '__main__':
    convert_md_to_html(r'd:\ARYAN ACADEMIC\SEM7\Capstone Project\docs\master_project_blueprint.md', r'd:\ARYAN ACADEMIC\SEM7\Capstone Project\docs\master_project_blueprint.html')
    print("Full HTML conversion completed!")
