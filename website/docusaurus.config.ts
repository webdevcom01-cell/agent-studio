import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'Agent Studio',
  tagline: 'Visual AI agent builder with multi-agent orchestration',
  favicon: 'img/favicon.ico',

  future: {
    v4: true,
  },

  url: 'https://webdevcom01-cell.github.io',
  baseUrl: '/agent-studio/',

  organizationName: 'webdevcom01-cell',
  projectName: 'agent-studio',

  onBrokenLinks: 'throw',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          editUrl:
            'https://github.com/webdevcom01-cell/agent-studio/tree/main/website/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    colorMode: {
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'Agent Studio',
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'tutorialSidebar',
          position: 'left',
          label: 'Docs',
        },
        {
          href: 'https://github.com/webdevcom01-cell/agent-studio',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Documentation',
          items: [
            {
              label: 'Getting Started',
              to: '/docs',
            },
          ],
        },
        {
          title: 'Links',
          items: [
            {
              label: 'GitHub',
              href: 'https://github.com/webdevcom01-cell/agent-studio',
            },
          ],
        },
      ],
      copyright: `Copyright ${new Date().getFullYear()} Agent Studio Contributors. Apache License 2.0.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
