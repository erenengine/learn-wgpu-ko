module.exports = {
    base: '/learn-wgpu-ko/',
    title: 'WGPU 학습하기',
    theme: 'thindark',
    plugins: {
        'vuepress-plugin-code-copy': true,
        '@vuepress/back-to-top': true,
        'seo': {
            url: (_, $site, path) => ($site.themeConfig.domain || '') + path,
        },
    },
    themeConfig: {
        domain: '/learn-wgpu-ko',
        author: {
            name: 'Benjamin Hansen',
            twitter: 'https://twitter.com/sotrh760',
        },
        displayAllHeaders: false,
        lastUpdated: 'Last Updated',
        sidebar: [
            '/',
            {
                title: '초보자',
                collapsable: false,
                children: [
                    '/beginner/tutorial1-window/',
                    '/beginner/tutorial2-surface/',
                    '/beginner/tutorial3-pipeline/',
                    '/beginner/tutorial4-buffer/',
                    '/beginner/tutorial5-textures/',
                    '/beginner/tutorial6-uniforms/',
                    '/beginner/tutorial7-instancing/',
                    '/beginner/tutorial8-depth/',
                    '/beginner/tutorial9-models/',
                ],
            },
            {
                title: '중급자',
                collapsable: false,
                children: [
                    '/intermediate/tutorial10-lighting/',
                    '/intermediate/tutorial11-normals/',
                    '/intermediate/tutorial12-camera/',
                    '/intermediate/tutorial13-hdr/',
                ],
            },
            {
                title: '쇼케이스',
                collapsable: true,
                children: [
                    '/showcase/',
                    '/showcase/windowless/',
                    '/showcase/gifs/',
                    '/showcase/pong/',
                    '/showcase/compute/',
                    '/showcase/alignment/',
                ]
            },
            {
                title: '뉴스',
                collapsable: true,
                children: [
                    '/news/25.0/',
                    '/news/24.0/',
                    '/news/22.0/',
                    '/news/0.18 and hdr/',
                    '/news/0.17/',
                    '/news/0.16/',
                    '/news/0.15/',
                    '/news/0.14/',
                    '/news/0.13/',
                    '/news/0.12/',
                    '/news/pre-0.12/',
                    '/news/update-to-winit-0.30/',
                ]
            }
        ]
    }
}