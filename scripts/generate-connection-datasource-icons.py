#!/usr/bin/env python3
"""Compile pinned local SVG artwork to data; renderer never parses HTML or fetches icons."""
import json
import re
from pathlib import Path
import xml.etree.ElementTree as ET

root = Path(__file__).resolve().parents[1]
assets = root / 'vscode-plugin/media/datasources'
manifest = json.loads((assets / 'sources.json').read_text())
allowed = {'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'defs', 'linearGradient', 'radialGradient', 'stop', 'clipPath', 'mask', 'filter', 'feColorMatrix', 'use'}

def convert(element):
    tag = element.tag.rsplit('}', 1)[-1]
    if tag == 'title':
        return None  # Type names are already visible; decorative SVG is aria-hidden.
    if tag not in allowed:
        raise ValueError('Unsupported SVG element: ' + tag)
    attributes = {}
    for key, value in element.attrib.items():
        key = key.rsplit('}', 1)[-1]
        if key.lower().startswith('on') or key in {'style', 'src'}:
            raise ValueError('Unsafe attribute: ' + key)
        if key == 'href' and not value.startswith('#'):
            raise ValueError('Only local SVG references are supported')
        if 'url(' in value and not re.fullmatch(r'url\(#[A-Za-z_][\w.-]*\)', value):
            raise ValueError('Only local SVG paint references are supported')
        attributes[key] = value
    children = [node for child in element if (node := convert(child)) is not None]
    return {'tag': tag, 'attributes': attributes, 'children': children}

icons = {}
for source in manifest['icons']:
    svg = ET.fromstring((assets / source['file']).read_bytes())
    icon = {'viewBox': svg.attrib['viewBox'], 'fill': svg.get('fill', source.get('color', '#000000')), 'sourceFile': source['file'], 'nodes': [node for child in svg if (node := convert(child)) is not None]}
    for kind in source['kinds']:
        if kind in icons:
            raise ValueError('Duplicate kind: ' + kind)
        icons[kind] = icon
output = root / 'vscode-plugin/src/connections/datasource-icons.ts'
output.write_text('''/** Generated from pinned upstream SVGs; run scripts/generate-connection-datasource-icons.py. */
export interface DatasourceIconNode { readonly tag:string; readonly attributes:Readonly<Record<string,string>>; readonly children:readonly DatasourceIconNode[] }
export interface DatasourceIcon { readonly viewBox:string; readonly fill:string; readonly sourceFile:string; readonly nodes:readonly DatasourceIconNode[] }
export const DATASOURCE_ICONS:Readonly<Record<string,DatasourceIcon>>=''' + json.dumps(icons, separators=(',', ':')) + ';\n')
print('Compiled', len(icons), 'datasource icons')
