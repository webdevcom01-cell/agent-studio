/**
 * GraphQL operations for the Railway public API.
 *
 * Every query/mutation below is copied from Railway's official documentation
 * (github.com/railwayapp/docs, content/docs/integrations/api/*). No invented fields.
 */

export const ME_QUERY = /* GraphQL */ `
  query { me { id name email } }
`;

export const PROJECTS_QUERY = /* GraphQL */ `
  query projects($first: Int, $after: String) {
    projects(first: $first, after: $after) {
      edges { node { id name description createdAt updatedAt } }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

export const WORKSPACE_PROJECTS_QUERY = /* GraphQL */ `
  query workspaceProjects($workspaceId: String!, $first: Int, $after: String) {
    projects(workspaceId: $workspaceId, first: $first, after: $after) {
      edges { node { id name description createdAt updatedAt } }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

export const PROJECT_QUERY = /* GraphQL */ `
  query project($id: String!) {
    project(id: $id) {
      id
      name
      description
      createdAt
      services { edges { node { id name icon } } }
      environments { edges { node { id name } } }
    }
  }
`;

export const ENVIRONMENTS_QUERY = /* GraphQL */ `
  query environments($projectId: String!, $isEphemeral: Boolean) {
    environments(projectId: $projectId, isEphemeral: $isEphemeral) {
      edges { node { id name createdAt } }
    }
  }
`;

/** Returns a JSON map { "KEY": "value", ... }. DATABASE_URL lives here. */
export const VARIABLES_QUERY = /* GraphQL */ `
  query variables($projectId: String!, $environmentId: String!, $serviceId: String) {
    variables(projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId)
  }
`;

// ---- Limited write (no deletes) ----

/** Upsert one or more variables. We never pass `replace: true`. */
export const VARIABLE_COLLECTION_UPSERT_MUTATION = /* GraphQL */ `
  mutation variableCollectionUpsert($input: VariableCollectionUpsertInput!) {
    variableCollectionUpsert(input: $input)
  }
`;

/** Redeploy a service's latest deployment in a given environment. */
export const SERVICE_INSTANCE_REDEPLOY_MUTATION = /* GraphQL */ `
  mutation serviceInstanceRedeploy($serviceId: String!, $environmentId: String!) {
    serviceInstanceRedeploy(serviceId: $serviceId, environmentId: $environmentId)
  }
`;
