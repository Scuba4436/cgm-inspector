#!/usr/bin/env python3
import os
import sys
import struct
import re
import argparse

VERSION_NAMES = {
    1: 'CGM:1987 (V1)',
    2: 'CGM:1992 (V2)',
    3: 'CGM:1999 (V3)',
    4: 'CGM:2001 (V4)'
}

def normalize_profile_id(pid):
    p = pid.strip()
    upper = p.upper()
    if 'ATA GRAPHICS' in upper or 'GREXCHANGE' in upper:
        return 'ATA GRAPHICS.GREXCHANGE'
    if upper == 'S1000D' or upper.startswith('S1000D'):
        return 'S1000D'
    if 'WEBCGM' in upper:
        return re.sub(r'(?i)webcgm', 'WebCGM', p)
    if 'PSC CGM' in upper:
        return p
    if 'J2008' in upper:
        return 'J2008'
    if 'ATA' in upper:
        return 'ATA'
    return p

def parse_profile_desc(desc, result):
    if not desc: return
    
    # regex for "Key:Value"
    kv_pattern = re.compile(r'"([^":]+):([^"]*)"')
    pairs = {}
    for match in kv_pattern.finditer(desc):
        key = match.group(1).strip().lower().replace(' ', '')
        val = match.group(2).strip()
        if key not in pairs:
            pairs[key] = val
            
    if not pairs:
        cleaned = re.sub(r'[\'"]', '', desc).strip()
        if 0 < len(cleaned) < 200 and not result.get('profileId'):
            result['profileId'] = cleaned
        return
        
    key_map = {
        'profileid': 'profileId',
        'profiled': 'profileId',
        'profileed': 'profileEd',
        'colourclass': 'colourClass',
        'colorclass': 'colourClass',
        'source': 'source',
        'date': 'date'
    }
    
    for raw_key, field in key_map.items():
        if raw_key in pairs and not result.get(field):
            result[field] = pairs[raw_key]
            
    if 'source' in result and result['source']:
        result['source'] = re.sub(r'^created by\s+', '', result['source'], flags=re.I).strip()

def analyze_file(filepath):
    result = {
        'version': 'Unbekannt',
        'profile': 'Kein Profil erkannt',
        'encoding': 'Binär',
        'profileId': '',
        'profileEd': '',
        'colourClass': '',
        'source': '',
        'date': '',
        'fontList': '',
        'status': 'error'
    }
    
    try:
        with open(filepath, 'rb') as f:
            data = f.read(16 * 1024)  # 16KB is enough for header
            
        # Clear text check
        is_clear_text = False
        try:
            head = data[:32].decode('ascii')
            if re.match(r'^\s*(BEGMF|MFVERSION)', head, re.I):
                is_clear_text = True
        except:
            pass
            
        if is_clear_text:
            result['encoding'] = 'ASCII'
            text = data.decode('ascii', errors='replace')
            
            ver_match = re.search(r'MFVERSION\s+(\d+)', text, re.I)
            if ver_match:
                result['version'] = ver_match.group(1)
                
            desc_match = re.search(r'MFDESC\s+\'([\s\S]*?)\'\s*;', text, re.I)
            if desc_match:
                parse_profile_desc(desc_match.group(1), result)
                
            if not result.get('profileId'):
                elem_match = re.search(r'MFELEMLIST\s+\'([^\']+)\'', text, re.I)
                if elem_match:
                    elem = elem_match.group(1).strip().upper()
                    if elem.startswith('VERSION4') or elem == 'VERSION3':
                        result['profileId'] = 'ATA GRAPHICS.GREXCHANGE'
                        
            font_match = re.search(r'FONTLIST\s+\'([^\']+)\'', text, re.I)
            if font_match:
                result['fontList'] = font_match.group(1).replace(',', ', ').strip()
                
        else:
            result['encoding'] = 'Binär'
            view = data
            offset = 0
            
            while offset < min(len(view) - 1, 2000): # Don't scan entire file if huge
                cmd = struct.unpack_from('>H', view, offset)[0]
                offset += 2
                
                elem_class = (cmd >> 12) & 0x0F
                elem_id = (cmd >> 5) & 0x7F
                param_len = cmd & 0x1F
                
                if param_len == 31:
                    if offset + 1 >= len(view): break
                    ext = struct.unpack_from('>H', view, offset)[0]
                    offset += 2
                    param_len = ext & 0x7FFF
                    
                if elem_class == 1:
                    if elem_id == 1 and param_len >= 2:
                        ver = struct.unpack_from('>H', view, offset)[0]
                        result['version'] = str(ver)
                    elif elem_id == 2:
                        slen = view[offset] if offset < len(view) else 0
                        sstart = offset + 1
                        if slen == 255:
                            if offset + 2 < len(view):
                                slen = struct.unpack_from('>H', view, offset+1)[0]
                                sstart = offset + 3
                            else:
                                slen = 0
                        if slen > 0 and sstart + slen <= len(view):
                            desc_raw = view[sstart:sstart+slen]
                            desc = desc_raw.decode('ascii', errors='replace')
                            desc = re.sub(r'[^\x20-\x7E]', '', desc).strip()
                            parse_profile_desc(desc, result)
                    elif elem_id == 13:
                        slen = view[offset] if offset < len(view) else 0
                        sstart = offset + 1
                        if slen == 255:
                            if offset + 2 < len(view):
                                slen = struct.unpack_from('>H', view, offset+1)[0]
                                sstart = offset + 3
                            else:
                                slen = 0
                        if slen > 0 and sstart + slen <= len(view):
                            fonts_raw = view[sstart:sstart+slen]
                            fonts = fonts_raw.decode('ascii', errors='replace')
                            fonts = re.sub(r'[^\x20-\x7E]', '', fonts).strip()
                            result['fontList'] = fonts
                            
                if elem_class >= 2 and elem_class <= 5:
                    break
                    
                aligned_len = param_len + 1 if param_len % 2 != 0 else param_len
                offset += aligned_len
                
        # Format version
        v_num = int(result['version']) if result['version'].isdigit() else 0
        if v_num in VERSION_NAMES:
            result['version'] = VERSION_NAMES[v_num]
        elif v_num > 0:
            result['version'] = f"V{v_num}"
            
        # Format date
        if result['date'] and re.match(r'^\d{8}$', result['date']):
            d = result['date']
            result['date'] = f"{d[6:8]}.{d[4:6]}.{d[0:4]}"
            
        result['status'] = 'success' if result['profileId'] else 'unknown'
            
    except Exception as e:
        result['status'] = 'error'
        result['source'] = str(e)
        
    return result

def main():
    parser = argparse.ArgumentParser(description='CGM Inspector CLI')
    parser.add_argument('path', nargs='?', default='.', help='File or directory to scan (default: current directory)')
    args = parser.parse_args()
    
    files_to_scan = []
    
    if os.path.isfile(args.path) and args.path.lower().endswith('.cgm'):
        files_to_scan.append(args.path)
    elif os.path.isdir(args.path):
        for root, _, files in os.walk(args.path):
            for f in files:
                if f.lower().endswith('.cgm'):
                    files_to_scan.append(os.path.join(root, f))
    else:
        print(f"Error: {args.path} is not a valid CGM file or directory.")
        sys.exit(1)
        
    if not files_to_scan:
        print("No CGM files found.")
        sys.exit(0)
        
    print(f"\nCGM Inspector - Scanning {len(files_to_scan)} files...\n")
    
    # Print header
    header_fmt = "{:<35} | {:<10} | {:<15} | {:<25} | {:<7} | {:<10} | {:<15} | {:<10} | {:<8}"
    print(header_fmt.format(
        "Dateiname", "Kodierung", "Version", "Profil-ID", "Edition", "Farbe", "Quelle", "Datum", "Status"
    ))
    print("-" * 155)
    
    stats = {'total': len(files_to_scan), 'success': 0, 'unknown': 0, 'error': 0}
    
    for filepath in sorted(files_to_scan):
        filename = os.path.basename(filepath)
        if len(filename) > 33:
            disp_name = filename[:30] + "..."
        else:
            disp_name = filename
            
        res = analyze_file(filepath)
        stats[res['status']] += 1
        
        prof_id = normalize_profile_id(res['profileId']) if res['profileId'] else '-'
        if len(prof_id) > 23: prof_id = prof_id[:20] + "..."
        
        source = res['source'] if res['source'] else '-'
        if len(source) > 13: source = source[:10] + "..."
        
        status_display = {
            'success': 'Erkannt',
            'unknown': 'Unbekannt',
            'error': 'Fehler'
        }.get(res['status'], res['status'])
        
        print(header_fmt.format(
            disp_name,
            res['encoding'],
            res['version'][:15],
            prof_id,
            res['profileEd'] if res['profileEd'] else '-',
            res['colourClass'] if res['colourClass'] else '-',
            source,
            res['date'] if res['date'] else '-',
            status_display
        ))
        
    print("-" * 155)
    print(f"Gesamt: {stats['total']} | Profil erkannt: {stats['success']} | Kein Profil: {stats['unknown']} | Fehler: {stats['error']}\n")

if __name__ == '__main__':
    main()
