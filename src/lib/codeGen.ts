import { ApiEndpoint } from '../data';

export const generateCodeSnippet = (
  language: string,
  endpoint: ApiEndpoint,
  baseUrl: string,
  headers: Record<string, string>,
  queryParams: Record<string, string>,
  pathParams: Record<string, string>,
  body: string
) => {
  let url = `${baseUrl}${endpoint.path}`;
  
  // Replace path params
  Object.entries(pathParams).forEach(([key, value]) => {
    url = url.replace(`{${key}}`, value || `{${key}}`);
  });

  // Add query params
  const qs = new URLSearchParams(queryParams).toString();
  if (qs) url += `?${qs}`;

  switch (language) {
    case 'cURL':
      let curl = `curl -X ${endpoint.method} "${url}"`;
      Object.entries(headers).forEach(([key, value]) => {
        curl += ` \\\n  -H "${key}: ${value}"`;
      });
      if (endpoint.method !== 'GET' && body) {
        curl += ` \\\n  -d '${body}'`;
      }
      return curl;

    case 'Python':
      let python = `import requests\n\nurl = "${url}"\n`;
      if (Object.keys(headers).length > 0) {
        python += `headers = ${JSON.stringify(headers, null, 4)}\n`;
      }
      if (endpoint.method !== 'GET' && body) {
        python += `payload = ${body}\n`;
        python += `response = requests.${endpoint.method.toLowerCase()}(url, headers=headers, json=payload)`;
      } else {
        python += `response = requests.${endpoint.method.toLowerCase()}(url, headers=headers)`;
      }
      python += `\n\nprint(response.json())`;
      return python;

    case 'JavaScript':
      let js = `const url = "${url}";\n`;
      const fetchOptions: any = {
        method: endpoint.method,
        headers: headers
      };
      if (endpoint.method !== 'GET' && body) {
        fetchOptions.body = JSON.parse(body || '{}');
      }
      js += `\nfetch(url, ${JSON.stringify(fetchOptions, null, 2)})\n  .then(res => res.json())\n  .then(console.log);`;
      return js;

    case 'PHP':
      return `<?php\n$client = new \\GuzzleHttp\\Client();\n$response = $client->request('${endpoint.method}', '${url}', [\n  'headers' => ${JSON.stringify(headers)},\n  'body' => '${body}'\n]);\necho $response->getBody();`;

    case 'Java':
      return `OkHttpClient client = new OkHttpClient();\nRequest request = new Request.Builder()\n  .url("${url}")\n  .method("${endpoint.method}", ${body ? `RequestBody.create(JSON, "${body}")` : 'null'})\n  .build();\nResponse response = client.newCall(request).execute();`;

    case 'C#':
      return `var client = new HttpClient();\nvar request = new HttpRequestMessage(HttpMethod.${endpoint.method}, "${url}");\n${Object.entries(headers).map(([k, v]) => `request.Headers.Add("${k}", "${v}");`).join('\n')}\n${body ? `request.Content = new StringContent("${body}", Encoding.UTF8, "application/json");` : ''}\nvar response = await client.SendAsync(request);\nConsole.WriteLine(await response.Content.ReadAsStringAsync());`;

    default:
      return '';
  }
};
