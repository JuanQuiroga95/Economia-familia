const url = 'https://economia-familia-fajg4mfqq-juanpabloquiroga95-1031s-projects.vercel.app/api/debug-db';

fetch(url)
  .then(res => res.json())
  .then(data => {
    console.log("Investments length:", data.investments.length);
    console.log("Savings length:", data.savings.length);
    console.log("Accounts:", data.accounts.map((a: any) => a.username));
  })
  .catch(err => console.error(err));
