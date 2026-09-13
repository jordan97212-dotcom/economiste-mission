import type { NextConfig } from 'next'

const config: NextConfig = {
  reactStrictMode: true,
  // Sortie autonome : l'image Docker n'embarque que ce que l'application
  // utilise réellement, au lieu de tout node_modules.
  output: 'standalone',
}

export default config
