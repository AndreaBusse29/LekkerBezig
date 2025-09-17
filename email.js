const dateStr = new Date().toLocaleDateString("nl-NL", {
    weekday: 'long',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric'
})

async function sendMail() {
    try {
        // Get current selections from the app
        const selectedItemsArray = Array.from(selectedItems || new Set());
        const orderItems = selectedItemsArray.map(itemId => {
            // Convert item ID back to readable name
            const itemName = itemId.replace(/-/g, ' ')
                .split(' ')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' ');
            return { name: itemName, units: 1 };
        });

        // Fetch EmailJS config from server
        let emailConfig;
        try {
            const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
                ? 'http://localhost:3001/api'
                : '/api';
                
            const response = await fetch(`${API_BASE_URL}/emailjs-config`, {
                headers: {
                    'Authorization': `Bearer ${authToken}`
                },
                credentials: 'include'
            });
            
            if (!response.ok) {
                throw new Error('Failed to fetch email configuration');
            }
            
            emailConfig = await response.json();
        } catch (error) {
            console.error('Error fetching email config:', error);
            throw new Error('Email configuration not available');
        }
        
        // Submit order to backend
        const orderResponse = await fetch(`${API_BASE_URL}/orders`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                userId: userId,
                userName: localStorage.getItem('lekker-bezig-user-name') || emailConfig.nameOfExpert,
                email: emailConfig.emailTo,
                items: orderItems,
                totalAmount: orderItems.length
            })
        });
        
        if (orderResponse.ok) {
            console.log('Order submitted to backend');
        }
        
        // Send email
        // emailjs.send(
        //     emailConfig.serviceId,
        //     emailConfig.templateId,
        //     {
        //         emailTo: emailConfig.emailTo,
        //         fromName: emailConfig.emailFrom,
        //         date: dateStr,
        //         orders: orderItems,
        //         nameOfExpert: emailConfig.nameOfExpert,
        //     },
        //     emailConfig.publicKey
        // ).then(response => {
        //     console.log('Email sent successfully!', response.status, response.text);
        //     alert('Order placed successfully!');
        // }).catch(error => {
        //     console.error('Email failed:', error);
        //     alert('Failed to send order email');
        // });
        
    } catch (error) {
        console.error('Order submission failed:', error);
        alert('Failed to submit order');
    }
}