import addonPath from '../../../node_modules/@img/sharp-linuxmusl-x64/lib/sharp-linuxmusl-x64.node' with { type: 'file' }
import libvipsPath from '../../../node_modules/@img/sharp-libvips-linuxmusl-x64/lib/libvips-cpp.so.8.17.3' with { type: 'file' }

const sharpLinuxMuslX64Assets = {
  slug: 'linux-x64-musl',
  addonPath,
  addonRelativePath: 'node_modules/@img/sharp-linuxmusl-x64/lib/sharp-linuxmusl-x64.node',
  libvipsPath,
  libvipsRelativePath:
    'node_modules/@img/sharp-libvips-linuxmusl-x64/lib/libvips-cpp.so.8.17.3',
}

export default sharpLinuxMuslX64Assets
