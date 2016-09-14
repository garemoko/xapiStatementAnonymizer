var inLrs, outLrs;
try {
    inLrs = new TinCan.LRS(
        {
            endpoint: config.input.endpoint,
            username: config.input.key,
            password: config.input.secret,
            allowFail: false,
            version: '1.0.0'
        }
    );
}
catch (ex) {
    console.log("Failed to setup LRS object: " + ex);
}

try {
    outLrs = new TinCan.LRS(
        {
            endpoint: config.output.endpoint,
            username: config.output.key,
            password: config.output.secret,
            allowFail: false,
            version: '1.0.0'
        }
    );
}
catch (ex) {
    console.log("Failed to setup LRS object: " + ex);
}

var agents = {
    'mbox': {},
    'account': {}
};

var params = trimNulls(config.lrsFilter);
console.log (params);

if (params.hasOwnProperty('agent')){
    params.agent = new TinCan.Agent(params.agent);
}

inLrs.queryStatements(
    {
        params: params,
        callback: fetchStatementsCallback
    }
);

function trimNulls(obj){
    for (var i in obj) {
        if (obj[i] === null) {
            delete obj[i];
        }
        // Recursion
        else if (typeof obj[i] === 'object') {
            obj[i] = trimNulls(obj[i]);
        }
        else if (typeof obj[i] === 'array') {
            var j;
            for (j = 0; j < obj[i].length; ++j) {
                obj[i][j] = trimNulls(obj[i][j]);
            }
        }
    }

    return obj;
}

function getStatmentProperty(value, filterStr){

    var filter = filterStr.split('.');
    while (filter.length > 0) {
        value = value[filter[0]];
        filter.shift();
    }
    return value;
}

function fetchStatementsCallback (err, sr) {
    console.log('fetched statements');
    if (err !== null) {
        console.log("Failed to query statements: " + err);
        console.log(sr)
        return;
    }

    processStatements(sr.statements);
    if (sr.more != null) 
    {
        inLrs.moreStatements(
            {
                url: sr.more,
                callback: fetchStatementsCallback
            }
        );
    }
}

function cloneStatement (inStatement){
    var outStatement = JSON.parse(JSON.stringify(inStatement));
    delete outStatement.authority;
    delete outStatement.stored;
    delete outStatement.id;
    for (var property in outStatement) {
        if (outStatement.hasOwnProperty(property)) {
            if (outStatement[property] == null){
                delete outStatement[property];
            }
        }
    }
    return new TinCan.Statement(outStatement);
}

function annoymizeStatement(statement){
    var annoymizedStatement = cloneStatement(statement);
    if (statement.actor.hasOwnProperty('mbox')){
        delete annoymizedStatement.actor;
        if (agents.mbox.hasOwnProperty(statement.actor.mbox)) {
            accountName = agents.mbox[statement.actor.mbox];
            annoymizedStatement.actor = new TinCan.Agent({ 
                'name': accountName,
                'account': {
                    'name': accountName,
                    'homePage': config.accountHomePage
                }
            });
        }
        else {
            accountName = TinCan.Utils.getUUID();
            annoymizedStatement.actor = new TinCan.Agent({ 
                'name': accountName,
                'account': {
                    'name': accountName,
                    'homePage': config.accountHomePage
                }
               
            });
            agents.mbox[statement.actor.mbox] = accountName;
        }
    }
    return annoymizedStatement;
}

function processStatements(statements){
    console.log('processing statements');

    var outStatements = [];

    var statementIndex,
    statementsLength = statements.length;
    for (statementIndex = 0; statementIndex < statementsLength; ++statementIndex) {
        var match = true;
        for (var filterStr in config.additionalFilter) {
            if (config.additionalFilter.hasOwnProperty(filterStr)) {
                if (getStatmentProperty(statements[statementIndex], filterStr) !== config.additionalFilter[filterStr]) {
                    match = false;
                }
            }
        }
        if (match == true){
            var modifiedStatement = annoymizeStatement(statements[statementIndex]);
            outStatements.push(modifiedStatement);
        }
    }
    console.log('Statements returned:');
    console.log(statements);
    console.log('Statements output:');
    console.log(outStatements);

    var result = outLrs.saveStatements(outStatements);
    if (result.err !== null) {
        if (/^\d+$/.test(result.err)) {
            if (result.err === 0) {
                console.log("Failed to save statements: aborted, offline, or invalid CORS endpoint");
            }
            else {
                console.log("Failed to save statements: " + result.xhr.responseText);
            }
        }
        else {
            console.log("Failed to save statements: " + result.err);
        }
    }
    else {
        console.log("Statements saved");
    }
}
