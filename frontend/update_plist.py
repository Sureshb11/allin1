import plistlib
import os
import glob

plist_path = '/Volumes/BSB/allin1-local/frontend/ios/allin1/Info.plist'
fonts_dir = '/Volumes/BSB/allin1-local/frontend/ios/allin1/Fonts'

with open(plist_path, 'rb') as f:
    pl = plistlib.load(f)

if 'UIAppFonts' not in pl:
    pl['UIAppFonts'] = []

font_files = [os.path.basename(f) for f in glob.glob(os.path.join(fonts_dir, '*.ttf'))]

for font in font_files:
    if font not in pl['UIAppFonts']:
        pl['UIAppFonts'].append(font)

with open(plist_path, 'wb') as f:
    plistlib.dump(pl, f)
