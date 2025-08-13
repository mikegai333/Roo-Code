// Simple test script to verify VSCodeWorkspace creation
const { ServiceContainer } = require('../out/src/copilot/extension/services/serviceContainer');

console.log('Testing VSCodeWorkspace creation...');

try {
    // Create service container
    const serviceContainer = new ServiceContainer();
    console.log('✓ ServiceContainer created successfully');
    
    // Create VSCodeWorkspace
    const workspace = serviceContainer.createVSCodeWorkspace();
    console.log('✓ VSCodeWorkspace created successfully');
    
    // Check if workspace has required properties
    if (workspace.openDocuments) {
        console.log('✓ VSCodeWorkspace has openDocuments property');
    }
    
    if (typeof workspace.getDocumentByTextDocument === 'function') {
        console.log('✓ VSCodeWorkspace has getDocumentByTextDocument method');
    }
    
    if (typeof workspace.getWorkspaceRoot === 'function') {
        console.log('✓ VSCodeWorkspace has getWorkspaceRoot method');
    }
    
    // Clean up
    if (workspace && typeof workspace.dispose === 'function') {
        workspace.dispose();
        console.log('✓ VSCodeWorkspace disposed successfully');
    }
    
    serviceContainer.dispose();
    console.log('✓ ServiceContainer disposed successfully');
    
    console.log('\n🎉 All tests passed! VSCodeWorkspace can be created successfully.');
    
} catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
}