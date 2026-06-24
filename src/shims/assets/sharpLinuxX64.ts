import addonPath from '../../../node_modules/@img/sharp-linux-x64/lib/sharp-linux-x64.node' with { type: 'file' }
import libvipsPath from '../../../node_modules/@img/sharp-libvips-linux-x64/lib/libvips-cpp.so.8.17.3' with { type: 'file' }

const sharpLinuxX64Assets = {
  slug: 'linux-x64',
  addonPath,
  addonRelativePath: 'node_modules/@img/sharp-linux-x64/lib/sharp-linux-x64.node',
  libvipsPath,
  libvipsRelativePath:
    'node_modules/@img/sharp-libvips-linux-x64/lib/libvips-cpp.so.8.17.3',
}

export default sharpLinuxX64Assets
