import { Button } from '@mui/joy'
import './App.css'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'

const queryClient = new QueryClient()


function App() {

  return (
    <QueryClientProvider client={queryClient}>

      {/* <Button onClick={() => { }}>Press Me</Button> */}
      <ComponentWithData />
    </QueryClientProvider>
  )
}

function ComponentWithData() {
  const testQuery = useQuery({
    queryKey: ['test'],
    queryFn: async () => {
      const req = await fetch('http://localhost:8999')
      const json = await req.json()
      console.log('hello request', json)
      return json
    }
  })
  return <div>{JSON.stringify(testQuery.data)}</div>

}

export default App
