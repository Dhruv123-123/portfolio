import { createRouter, createWebHistory } from 'vue-router'
import Loader from '../views/Loader.vue'
import Office from '../views/Office.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: Loader,
      meta: {
        title: 'Portfolio | Dhruv Ramasubban',
        metaTags: [
          {
            rel: 'canonical',
            href: 'https://dhruvramasubban.com'
          },
          {
            name: 'title',
            content: 'Portfolio | Dhruv Ramasubban'
          },
          {
            name: 'description',
            content:
              'Discover the portfolio of Dhruv Ramasubban — developer, creator, and builder of web experiences.'
          },
          {
            name: 'keywords',
            content: 'portfolio, dhruv ramasubban, computer science, machine learning, computer vision, UC Berkeley, Python, PyTorch, OpenCV'
          },
          {
            name: 'author',
            content: 'Dhruv Ramasubban'
          },
          {
            name: 'robots',
            content: 'index, follow'
          },
          {
            name: 'theme-color',
            content: '#000000'
          },
          {
            name: 'mobile-web-app-capable',
            content: 'yes'
          },
          {
            name: 'apple-mobile-web-app-status-bar-style',
            content: 'black'
          },
          {
            name: 'apple-mobile-web-app-title',
            content: 'Portfolio | Dhruv Ramasubban'
          },
          {
            name: 'application-name',
            content: 'Portfolio | Dhruv Ramasubban'
          },
          {
            name: 'twitter:card',
            content: 'summary'
          },
          {
            name: 'twitter:title',
            content: 'Portfolio | Dhruv Ramasubban'
          },
          {
            name: 'twitter:description',
            content:
              'Discover the portfolio of Dhruv Ramasubban — developer, creator, and builder of web experiences.'
          },
          {
            name: 'twitter:image',
            content: 'https://dhruvramasubban.com/img/logo-portfolio-black.svg'
          },
          {
            name: 'twitter:image:alt',
            content: 'Logo Portfolio Dhruv Ramasubban'
          },
          {
            property: 'og:type',
            content: 'website'
          },
          {
            property: 'og:title',
            content: 'Portfolio | Dhruv Ramasubban'
          },
          {
            property: 'og:description',
            content:
              'Discover the portfolio of Dhruv Ramasubban — developer, creator, and builder of web experiences.'
          },
          {
            property: 'og:site_name',
            content: 'Portfolio | Dhruv Ramasubban'
          },
          {
            property: 'og:url',
            content: 'https://dhruvramasubban.com'
          },
          {
            property: 'og:image',
            content: 'https://dhruvramasubban.com/img/logo-portfolio-black.svg'
          },
          {
            property: 'og:image:alt',
            content: 'Logo Portfolio Dhruv Ramasubban'
          },
          {
            property: 'og:locale',
            content: 'en_US'
          }
        ]
      }
    },
    {
      path: '/office',
      name: 'Office',
      component: Office,
      meta: {
        title: 'Desktop | Dhruv Ramasubban',
        metaTags: [
          {
            rel: 'canonical',
            href: 'https://dhruvramasubban.com/office'
          },
          {
            name: 'title',
            content: 'Desktop | Dhruv Ramasubban'
          },
          {
            name: 'description',
            content:
              'Explore the desktop of Dhruv Ramasubban — browse projects, documents, and more in a Windows XP-style interface.'
          },
          {
            name: 'keywords',
            content: 'desktop, dhruv ramasubban, computer science, machine learning, computer vision, UC Berkeley, Python, PyTorch, OpenCV'
          },
          {
            name: 'author',
            content: 'Dhruv Ramasubban'
          },
          {
            name: 'robots',
            content: 'index, follow'
          },
          {
            name: 'theme-color',
            content: '#000000'
          },
          {
            name: 'mobile-web-app-capable',
            content: 'yes'
          },
          {
            name: 'apple-mobile-web-app-status-bar-style',
            content: 'black'
          },
          {
            name: 'apple-mobile-web-app-title',
            content: 'Desktop | Dhruv Ramasubban'
          },
          {
            name: 'application-name',
            content: 'Desktop | Dhruv Ramasubban'
          },
          {
            name: 'twitter:card',
            content: 'summary'
          },
          {
            name: 'twitter:title',
            content: 'Desktop | Dhruv Ramasubban'
          },
          {
            name: 'twitter:description',
            content:
              'Explore the desktop of Dhruv Ramasubban — browse projects, documents, and more in a Windows XP-style interface.'
          },
          {
            name: 'twitter:image',
            content: 'https://dhruvramasubban.com/img/logo-portfolio-black.svg'
          },
          {
            name: 'twitter:image:alt',
            content: 'Logo Portfolio Dhruv Ramasubban'
          },
          {
            name: 'og:type',
            content: 'website'
          },
          {
            name: 'og:title',
            content: 'Desktop | Dhruv Ramasubban'
          },
          {
            name: 'og:description',
            content:
              'Explore the desktop of Dhruv Ramasubban — browse projects, documents, and more in a Windows XP-style interface.'
          },
          {
            name: 'og:site_name',
            content: 'Desktop | Dhruv Ramasubban'
          },
          {
            name: 'og:url',
            content: 'https://dhruvramasubban.com/office'
          },
          {
            name: 'og:image',
            content: 'https://dhruvramasubban.com/img/logo-portfolio-black.svg'
          },
          {
            name: 'og:image:alt',
            content: 'Logo Portfolio Dhruv Ramasubban'
          },
          {
            name: 'og:locale',
            content: 'en_US'
          }
        ]
      }
    }
  ]
})

export default router
