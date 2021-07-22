const path = require(`path`)
const fetch = require('node-fetch');
const { createFilePath } = require(`gatsby-source-filesystem`)
const convert = require('xml-js');

function slugify(text)
{
  return text.toString().toLowerCase()
    .replace(/\s+/g, '-')           // Replace spaces with -
    .replace(/[^\w\-]+/g, '')       // Remove all non-word chars
    .replace(/\-\-+/g, '-')         // Replace multiple - with single -
    .replace(/^-+/, '')             // Trim - from start of text
    .replace(/-+$/, '');            // Trim - from end of text
}

async function fetchYoutubeVideos() {
  const url = "https://www.youtube.com/feeds/videos.xml?channel_id=UCcuEG-IjaeHRgePmiJ0f8GA";

  const xml = await (await fetch(url)).text()
 
  const result = JSON.parse(convert.xml2json(xml, {compact: true, spaces: 4}));
 


  const feed = result.feed;

  const home_page_url = feed.author.uri;
  
  const items = feed.entry.map(item => ({guid: item.id._text, url: item.link._attributes.href, title: item.title._text, date_published: item.published._text}))

  return {
    url: home_page_url,
    videos: items.slice(0, 5)
  }
}

exports.sourceNodes = async ({ actions, createNodeId, createContentDigest }) => {
  const { createNode } = actions

  // Data can come from anywhere, but for now create it manually
  

  const {url, videos} = await fetchYoutubeVideos();

  for(let video of videos) {

    video.video_id = video.guid.replace('yt:video:', '');

    const nodeContent = JSON.stringify(video)

    const nodeMeta = {
      id: createNodeId(`video-${video.guid}`),
      parent: null,
      children: [],
      data: video,
      internal: {
        type: `YoutubeVideo`,
        mediaType: `text/html`,
        content: nodeContent,
        contentDigest: createContentDigest(video)
      }
    }
  
    const node = Object.assign({}, video, nodeMeta)

    createNode(node)
  }

  
}

async function getDocsForCMS(cms, graphql) {
  const result = await graphql(
    `
      {
        allMarkdownRemark(
          filter: {fields: {cms: {eq: "${cms}"}}}
          sort: {fields: fields___originalSlug}
        ) {
          nodes {
            id
            fields {
              slug,
              sidebar {
                folder,
                title,
                path
              }
            }
          }
        }
      }
    `
  )
  return result;
}

async function createDocsPagesForCMS(cms, graphql, createPage) {

  const doc = path.resolve(`./src/templates/doc.js`)

  const result = await getDocsForCMS(cms, graphql);
  if (result.errors) {
    reporter.panicOnBuild(
      `There was an error loading your docs`,
      result.errors
    )
    return
  }

  const posts = result.data.allMarkdownRemark.nodes

  const sidebar = posts.reduce( (prev, next) => {
    if (!prev[next.fields.sidebar.folder]) {
      prev[next.fields.sidebar.folder] = []
    }
    prev[next.fields.sidebar.folder].push(next.fields.sidebar)

    return prev;

  }, {});

  // `context` is available in the template as a prop and as a variable in GraphQL

  if (posts.length > 0) {
    posts.forEach((post, index) => {
      const previousPostId = index === 0 ? null : posts[index - 1].id
      const nextPostId = index === posts.length - 1 ? null : posts[index + 1].id

      createPage({
        path: post.fields.slug,
        component: doc,
        context: {
          id: post.id,
          previousPostId,
          nextPostId,
          sidebar
        },
      })
    })
  }
}

exports.createPages = async ({ graphql, actions, reporter }) => {
  const { createPage } = actions

  await createDocsPagesForCMS("shopify", graphql, createPage);
  await createDocsPagesForCMS("jamstack", graphql, createPage);
  await createDocsPagesForCMS("wordpress", graphql, createPage);
  await createDocsPagesForCMS("ghost", graphql, createPage);
}

exports.onCreateNode = ({ node, actions, getNode }) => {
  const { createNodeField } = actions

  if (node.internal.type === `MarkdownRemark`) {
    let value = createFilePath({ node, getNode });
    const cms = getNode(node.parent).sourceInstanceName;
    const originalPath = cms + value;
    
    const path = value.replace(/\d*/gm, '').replace(/ - /gm, '');
    value = path.toLowerCase().replace('index', '')
    value = "/" + cms + "/" + value.split('/').filter(e => !!e).map(value => slugify(value)).join("/");

    const sidebar = {folder: path.split('/').filter(e => !!e)[0],title: node.frontmatter.title, path: value}
    
    createNodeField({
      name: `slug`,
      node,
      value,
    })

    createNodeField({
      name: `originalSlug`,
      node,
      value: originalPath
    })

    createNodeField({
      name: `sidebar`,
      node,
      value: sidebar
    })

    createNodeField({
      name: 'cms',
      node,
      value: cms
    })
  }
}

exports.createSchemaCustomization = ({ actions }) => {
  const { createTypes } = actions

  // Explicitly define the siteMetadata {} object
  // This way those will always be defined even if removed from gatsby-config.js

  // Also explicitly define the Markdown frontmatter
  // This way the "MarkdownRemark" queries will return `null` even when no
  // blog posts are stored inside "content/blog" instead of returning an error
  createTypes(`
    type SiteSiteMetadata {
      author: Author
      siteUrl: String
      social: Social
    }

    type Author {
      name: String
      summary: String
    }

    type Social {
      twitter: String
    }

    type MarkdownRemark implements Node {
      frontmatter: Frontmatter
      fields: Fields
    }

    type Frontmatter {
      title: String
      description: String
      date: Date @dateformat
    }

    type SidebarPath {
      folder: String
      title: String
      path: String
    }

    type Fields {
      slug: String,
      cms: String,
      sidebar: SidebarPath
    }
  `)
}
