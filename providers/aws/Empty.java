import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;

public class Empty implements RequestHandler<Object, String> {
    	public String handleRequest(Object request, Context context) {
		return "{\"StatusCode\":200,\"body\":\"\"}";
	}
}
