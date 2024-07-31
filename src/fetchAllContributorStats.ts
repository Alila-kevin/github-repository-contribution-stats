import axios from 'axios';
import _ from 'lodash';

/**
 * The Fetch All Contributor Stats Function.
 *
 * This function combines all the yearly `contributionsCollection` from the
 * GitHub GraphQL APIs.
 *
 * @param {String} username The target GitHub username for contribution stats.
 *
 * @return {Promise<Object>}
 */
export async function fetchAllContributorStats(username) {
  try {
    // Ensure the personal access token is set
    if (!process.env.GITHUB_PERSONAL_ACCESS_TOKEN) {
      throw new Error('GitHub personal access token is not set in environment variables.');
    }

    const userData = await fetchUserData(username);
    const contributionData = await fetchContributionData(username, userData.contributionYears);

    return {
      id: userData.id,
      name: userData.name,
      repositoriesContributedTo: processContributions(contributionData),
    };
  } catch (error) {
    console.error('Error fetching contributor stats:', error);
    throw error;
  }
}

async function fetchUserData(username) {
  const response = await axios({
    url: 'https://api.github.com/graphql',
    method: 'POST',
    headers: {
      Authorization: `token ${process.env.GITHUB_PERSONAL_ACCESS_TOKEN}`,
    },
    data: {
      query: `
        query {
          user(login: "${username}") {
            id
            name
            contributionsCollection {
              contributionYears
            }
          }
        }`,
    },
  });

  const {
    data: {
      data: {
        user: { id, name, contributionsCollection: { contributionYears } },
      },
    },
  } = response;

  return { id, name, contributionYears };
}

async function fetchContributionData(username, contributionYears) {
  const contributionPromises = contributionYears.map((year) =>
    axios({
      url: 'https://api.github.com/graphql',
      method: 'POST',
      headers: {
        Authorization: `token ${process.env.GITHUB_PERSONAL_ACCESS_TOKEN}`,
      },
      data: {
        query: `
          query {
            user(login: ${JSON.stringify(username)}) {
              contributionsCollection(from: "${year}-01-01T00:00:00Z") {
                commitContributionsByRepository(maxRepositories: 100) {
                  contributions {
                    totalCount
                  }
                  repository {
                    owner {
                      id
                      avatarUrl
                    }
                    isInOrganization
                    url
                    homepageUrl
                    name
                    nameWithOwner
                    stargazerCount
                    openGraphImageUrl
                    defaultBranchRef {
                      target {
                        ... on Commit {
                          history {
                            totalCount
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }`,
      },
    }),
  );

  const responses = await Promise.all(contributionPromises);
  return responses.map((response) => response.data.data.user.contributionsCollection.commitContributionsByRepository);
}

function processContributions(contributions) {
  return _.chain(contributions)
    .flatten()
    .groupBy(([repo]) => repo.nameWithOwner)
    .map((group) => {
      const key = group[0].repository.nameWithOwner;
      const totalCount = _.sumBy(group, ({ contributions }) => contributions.totalCount);
      return {
        ...group[0].repository,
        numOfMyContributions: totalCount,
      };
    })
    .value();
}
