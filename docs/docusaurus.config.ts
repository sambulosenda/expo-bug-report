import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'BugPulse',
  tagline: 'Open-source bug reporting for React Native. Every report includes your app state.',
  favicon: 'img/favicon.ico',

  future: {
    v4: true,
  },

  url: 'https://sambulosenda.github.io',
  baseUrl: '/expo-bug-report/',

  organizationName: 'sambulosenda',
  projectName: 'expo-bug-report',

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
          routeBasePath: '/',
          editUrl: 'https://github.com/sambulosenda/expo-bug-report/tree/main/docs/',
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
      defaultMode: 'dark',
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'BugPulse',
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docs',
          position: 'left',
          label: 'Docs',
        },
        {
          href: 'https://github.com/sambulosenda/expo-bug-report',
          label: 'GitHub',
          position: 'right',
        },
        {
          href: 'https://www.npmjs.com/package/@bugpulse/react-native',
          label: 'npm',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            { label: 'Getting Started', to: '/' },
            { label: 'API Reference', to: '/api' },
            { label: 'Integrations', to: '/integrations' },
          ],
        },
        {
          title: 'Community',
          items: [
            {
              label: 'GitHub Discussions',
              href: 'https://github.com/sambulosenda/expo-bug-report/discussions',
            },
            {
              label: 'GitHub Issues',
              href: 'https://github.com/sambulosenda/expo-bug-report/issues',
            },
          ],
        },
      ],
      copyright: `MIT License. Built by Sam Senda.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['bash'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
