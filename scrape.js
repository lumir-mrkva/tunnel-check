var elasticsearch = require('elasticsearch');
var Client = require('node-rest-client').Client;
var mapping = require('./mapping.json');
var async = require('async');

var http = new Client();

var api = 'https://api.csas.cz/sandbox/webapi/v1/transparentAccounts';

var elasticHost = 'http://localhost:9200'

var elastic = new elasticsearch.Client({
  host: elasticHost,
  log: 'error'
});

elastic.ping({
  requestTimeout: 3000
}, function (error) {
  if (error) {
    console.error('elasticsearch is down!');
    process.exit(1);
  }
});

var args = {
  headers: {"web-api-key": "e1c9a88d-c0a2-470d-a1f9-52d2a8f974ed"}
};

async.series([
  function(callback) {
    elastic.indices.delete({index: 'transparent'}, function(err, resp) {
      console.log('deleting index');
      callback(null, resp);
    });
  },
  function(callback) {
    http.post(elasticHost + '/transparent', {data: mapping}, function(data, resp) {
      console.log('mapping setup');
      callback(null, resp);
    });
  },
  function(callback) {
    http.get(api + '/accounts', args, function (data, response) {
      var accounts = JSON.parse(data);
      console.log('found '+ accounts.length + ' accounts:');
      accounts.forEach(function (acc) {
        http.get(api + '/transactions/' + acc.accNumber + '?size=20000', args, function (data) {
          try {
            var transactions = JSON.parse(data);
            console.log(acc.name + ' with balance of ' + acc.balance + ' and ' + transactions.transactionsCount + ' transactions');
            //console.log(JSON.stringify(acc, null, 2));
            if (transactions.transactionsCount - transactions.transactions.length) {
              console.warn('this account has too many transactions to scrape');
            }
            var bulk = [];
            var index = { "index" : { "_index" : "transparent", "_type" : "transaction" } };
            transactions.transactions.forEach(function(transaction) {
              transaction.currency = transaction.amount.currency;
              transaction.amount = transaction.amount.value;
              transaction.receiver = accByIban(accounts, transaction.receiver.iban);
              bulk.push(index);
              bulk.push(transaction);
            });
            elastic.bulk({body:bulk}, function (err, resp) {

            });
            //console.log(JSON.stringify(transactions,null,2));
          } catch(err) {
            console.error('cannot scrape ' + acc.name, err);
          }
        });
      });

      callback(null, "finished");
    });
  }
], function(err, results){
  if (err) {
    console.error(err);
  } else {
    console.log('scraping finished');
  }
});

var accByIban = function(accounts, iban) {
  for (var i=0; i < accounts.length; i++) {
    if (accounts[i].iban === iban) {
      return accounts[i];
    }
  }
  console.log('acc not found');
}
